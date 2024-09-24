import { initializeKeypair } from "./initializeKeypair";
import {
  clusterApiUrl,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  Connection,
  PublicKey,
  AddressLookupTableProgram,
  TransactionInstruction,
  AddressLookupTableAccount
} from "@solana/web3.js";

async function initializeLookupTable(
  user: Keypair,
  connection: Connection,
  addresses: PublicKey[]
): Promise<PublicKey> {
  // Get the current slot
  const slot = await connection.getSlot();

  // Create an instruction for creating a lookup table
  // and retrieve the address of the new lookup table
  const [lookupTableInst, lookupTableAddress] =
    AddressLookupTableProgram.createLookupTable({
      authority: user.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
      payer: user.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
      recentSlot: slot - 1, // The recent slot to derive the lookup table's address
    });
  console.log("lookup table address:", lookupTableAddress.toBase58());

  // Create an instruction to extend a lookup table with the provided addresses
  const extendInstruction = AddressLookupTableProgram.extendLookupTable({
    payer: user.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
    authority: user.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
    lookupTable: lookupTableAddress, // The address of the lookup table to extend
    addresses: addresses.slice(0, 30), // The addresses to add to the lookup table
  });

  await sendV0Transaction(connection, user, [
    lookupTableInst,
    extendInstruction,
  ]);

  var remaining = addresses.slice(30);

  while (remaining.length > 0) {
    const toAdd = remaining.slice(0, 30);
    remaining = remaining.slice(30);
    const extendInstruction = AddressLookupTableProgram.extendLookupTable({
      payer: user.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
      authority: user.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
      lookupTable: lookupTableAddress, // The address of the lookup table to extend
      addresses: toAdd, // The addresses to add to the lookup table
    });

    await sendV0Transaction(connection, user, [extendInstruction]);
  }

  return lookupTableAddress;
}

async function sendV0Transaction(
  connection: Connection,
  user: Keypair,
  instructions: TransactionInstruction[],
  lookupTableAccounts?: AddressLookupTableAccount[]
) {
  // Get the latest blockhash and last valid block height
  const { lastValidBlockHeight, blockhash } =
    await connection.getLatestBlockhash();

  // Create a new transaction message with the provided instructions
  const messageV0 = new TransactionMessage({
    payerKey: user.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
    recentBlockhash: blockhash, // The blockhash of the most recent block
    instructions, // The instructions to include in the transaction
  }).compileToV0Message(lookupTableAccounts ? lookupTableAccounts : undefined);

  // Create a new transaction object with the message
  const transaction = new VersionedTransaction(messageV0);

  // Sign the transaction with the user's keypair
  transaction.sign([user]);

  // Send the transaction to the cluster
  const txid = await connection.sendTransaction(transaction);

  // Confirm the transaction
  await connection.confirmTransaction(
    {
      blockhash: blockhash,
      lastValidBlockHeight: lastValidBlockHeight,
      signature: txid,
    },
    "finalized"
  );

  // Log the transaction URL on the Solana Explorer
  console.log(`https://explorer.solana.com/tx/${txid}?cluster=devnet`);
}

function waitForNewBlock(connection: Connection, targetHeight: number) {
  console.log(`Waiting for ${targetHeight} new blocks`);
  return new Promise(async (resolve: any) => {
    // Get the last valid block height of the blockchain
    const { lastValidBlockHeight } = await connection.getLatestBlockhash();

    // Set an interval to check for new blocks every 1000ms
    const intervalId = setInterval(async () => {
      // Get the new valid block height
      const { lastValidBlockHeight: newValidBlockHeight } =
        await connection.getLatestBlockhash();
      // console.log(newValidBlockHeight)

      // Check if the new valid block height is greater than the target block height
      if (newValidBlockHeight > lastValidBlockHeight + targetHeight) {
        // If the target block height is reached, clear the interval and resolve the promise
        clearInterval(intervalId);
        resolve();
      }
    }, 1000);
  });
}

try {
  // Connect to the devnet cluster
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  // Initialize the user's keypair
  const user = await initializeKeypair(connection);
  console.log("PublicKey:", user.publicKey.toBase58());

  // Generate 57 addresses
  const recipients = [];
  for (let i = 0; i < 57; i++) {
    recipients.push(Keypair.generate().publicKey);
  }

  const lookupTableAddress = await initializeLookupTable(
    user,
    connection,
    recipients
  );

  await waitForNewBlock(connection, 1);

  const lookupTableAccount = (
    await connection.getAddressLookupTable(lookupTableAddress)
  ).value;

  if (!lookupTableAccount) {
    throw new Error("Lookup table not found");
  }

  const transferInstructions = recipients.map((recipient) => {
    return SystemProgram.transfer({
      fromPubkey: user.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
      toPubkey: recipient, // The destination account for the transfer
      lamports: LAMPORTS_PER_SOL * 0.01, // Transfer 0.01 SOL to each recipient
    });
  });

  await sendV0Transaction(connection, user, transferInstructions, [
    lookupTableAccount,
  ]);

  console.log("Finished successfully");
} catch (error) {
  console.log(error);
}
