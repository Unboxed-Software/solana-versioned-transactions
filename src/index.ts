import { initializeKeypair } from "./initializeKeypair"
import * as web3 from "@solana/web3.js"

async function main() {
  // Connect to the devnet cluster
  const connection = new web3.Connection(web3.clusterApiUrl("devnet"))

  // Initialize the user's keypair
  const user = await initializeKeypair(connection)
  console.log("PublicKey:", user.publicKey.toBase58())

  // Generate 30 addresses
  const addresses = []
  for (let i = 0; i < 30; i++) {
    addresses.push(web3.Keypair.generate().publicKey)
  }

  // Create an instruction to creating a lookup table and the address of the lookup table
  const [lookupTableInst, lookupTableAddress] = await createLookupTableHelper(
    user,
    connection
  )

  // Create an "extend" instruction to add the addresses to the lookup table
  const extendInstruction = await extendLookupTableHelper(
    user,
    lookupTableAddress,
    addresses
  )

  // Send the transaction with the create lookup table and extend instructions
  await sendV0TransactionHelper(connection, user, [
    lookupTableInst,
    extendInstruction,
  ])

  // Get the lookup table account
  const lookupTableAccount = await getAddressLookupTableHelper(
    connection,
    lookupTableAddress
  )

  // If the lookup table account exists, create transfer instructions and send a transaction
  if (lookupTableAccount) {
    // Create transfer instructions for each address in the lookup table
    const transferInstructions = await createTransferInstructionsHelper(
      connection,
      lookupTableAccount,
      user
    )

    // Send a transaction with the transfer instructions and the lookup table account
    await sendV0TransactionHelper(connection, user, transferInstructions, [
      lookupTableAccount,
    ])
  }
}

async function createLookupTableHelper(
  user: web3.Keypair,
  connection: web3.Connection
): Promise<[web3.TransactionInstruction, web3.PublicKey]> {
  // Get the current slot
  const slot = await connection.getSlot()

  // Create a transaction instruction for creating a lookup table
  // and retrieve the address of the new lookup table
  const [lookupTableInst, lookupTableAddress] =
    web3.AddressLookupTableProgram.createLookupTable({
      authority: user.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
      payer: user.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
      recentSlot: slot - 5, // The recent slot to derive lookup table's address
    })
  console.log("lookup table address:", lookupTableAddress.toBase58())
  return [lookupTableInst, lookupTableAddress]
}

async function extendLookupTableHelper(
  user: web3.Keypair,
  lookupTableAddress: web3.PublicKey,
  addresses: web3.PublicKey[]
): Promise<web3.TransactionInstruction> {
  // Create a transaction instruction to extend a lookup table with the provided addresses
  const extendInstruction = web3.AddressLookupTableProgram.extendLookupTable({
    payer: user.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
    authority: user.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
    lookupTable: lookupTableAddress, // The address of the lookup table to extend
    addresses: addresses, // The addresses to add to the lookup table
  })
  return extendInstruction
}

async function getAddressLookupTableHelper(
  connection: web3.Connection,
  lookupTableAddress: web3.PublicKey
): Promise<web3.AddressLookupTableAccount> {
  let lookupTableAccount
  while (!lookupTableAccount) {
    try {
      lookupTableAccount = (
        await connection.getAddressLookupTable(lookupTableAddress)
      ).value
    } catch (err) {
      console.log(`Retrying: ${err}`)
    }
  }
  return lookupTableAccount
}

async function createTransferInstructionsHelper(
  connection: web3.Connection,
  lookupTableAccount: web3.AddressLookupTableAccount,
  user: web3.Keypair
) {
  // Get the addresses in the lookup table account
  const { addresses } = lookupTableAccount.state

  // Get the minimum balance required to be exempt from rent
  const minRent = await connection.getMinimumBalanceForRentExemption(0)

  const transferInstructions = []

  // For each address in the lookup table, create a transfer instruction
  for (const address of addresses) {
    transferInstructions.push(
      web3.SystemProgram.transfer({
        fromPubkey: user.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
        toPubkey: address, // The destination account for the transfer
        lamports: minRent, // The amount of lamports to transfer
      })
    )
  }

  return transferInstructions
}

async function sendV0TransactionHelper(
  connection: web3.Connection,
  user: web3.Keypair,
  instructions: web3.TransactionInstruction[],
  lookupTableAccounts?: web3.AddressLookupTableAccount[]
) {
  // Get the latest blockhash and last valid block height
  const { lastValidBlockHeight, blockhash } =
    await connection.getLatestBlockhash()

  // Create a new transaction message with the provided instructions
  const messageV0 = new web3.TransactionMessage({
    payerKey: user.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
    recentBlockhash: blockhash, // The blockhash of the most recent block
    instructions, // The instructions to include in the transaction
  }).compileToV0Message(lookupTableAccounts ? lookupTableAccounts : undefined)

  // Create a new transaction object with the message
  const transaction = new web3.VersionedTransaction(messageV0)

  // Sign the transaction with the user's keypair
  transaction.sign([user])

  // Send the transaction to the cluster
  const txid = await connection.sendTransaction(transaction)

  // Confirm the transaction
  await connection.confirmTransaction({
    blockhash: blockhash,
    lastValidBlockHeight: lastValidBlockHeight,
    signature: txid,
  })

  // Log the transaction URL on the Solana Explorer
  console.log(`https://explorer.solana.com/tx/${txid}?cluster=devnet`)
}

main()
  .then(() => {
    console.log("Finished successfully")
    process.exit(0)
  })
  .catch((error) => {
    console.log(error)
    process.exit(1)
  })
