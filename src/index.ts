import { initializeKeypair } from "./initializeKeypair";
import * as web3 from "@solana/web3.js";

try {
  // Connect to the devnet cluster
  const connection = new web3.Connection(web3.clusterApiUrl("devnet"));

  // Initialize the user's keypair
  const user = await initializeKeypair(connection);
  console.log("Public Key:", user.publicKey.toBase58());

  // Generate 22 addresses
  const recipients = [];
  for (let i = 0; i < 22; i++) {
    recipients.push(web3.Keypair.generate().publicKey);
  }

  // Create an array of transfer instructions
  const transferInstructions = [];

  // Add a transfer instruction for each address
  for (const address of recipients) {
    transferInstructions.push(
      web3.SystemProgram.transfer({
        fromPubkey: user.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
        toPubkey: address, // The destination account for the transfer
        lamports: web3.LAMPORTS_PER_SOL * 0.01, // The amount of lamports to transfer
      })
    );
  }

  // Get the latest blockhash and last valid block height
  const { lastValidBlockHeight, blockhash } =
    await connection.getLatestBlockhash();

  // Create the transaction message
  const message = new web3.TransactionMessage({
    payerKey: user.publicKey, // Public key of the account that will pay for the transaction
    recentBlockhash: blockhash, // Latest blockhash
    instructions: transferInstructions, // Instructions included in transaction
  }).compileToV0Message();

  // Create the versioned transaction using the message
  const transaction = new web3.VersionedTransaction(message);

  // Sign the transaction
  transaction.sign([user]);

  // Send the transaction to the cluster (this will fail in this example if addresses > 21)
  const txid = await connection.sendTransaction(transaction);

  // Confirm the transaction
  await connection.confirmTransaction({
    blockhash: blockhash,
    lastValidBlockHeight: lastValidBlockHeight,
    signature: txid,
  });

  // Log the transaction URL on the Solana Explorer
  console.log(`https://explorer.solana.com/tx/${txid}?cluster=devnet`);
  console.log("Finished successfully");
} catch (error) {
  console.log(error);
}
