import { initializeKeypair } from "./initializeKeypair"
import * as web3 from "@solana/web3.js"
import { transferInstructionData } from "@solana/spl-token"

async function main() {
  const connection = new web3.Connection(web3.clusterApiUrl("devnet"))
  const user = await initializeKeypair(connection)

  console.log("PublicKey:", user.publicKey.toBase58())

  const addresses = []
  for (let i = 0; i < 30; i++) {
    addresses.push(web3.Keypair.generate().publicKey)
  }

  const [lookupTableInst, lookupTableAddress] = await createLookupTable(
    user,
    connection
  )

  const extendInstruction = await extendLookupTable(
    user,
    lookupTableAddress,
    addresses
  )

  const instructions = [lookupTableInst, extendInstruction]
  await sendTransaction(connection, user, instructions)

  await new Promise((resolve) => setTimeout(resolve, 5000))

  const addresses2 = []
  for (let i = 0; i < 27; i++) {
    addresses2.push(web3.Keypair.generate().publicKey)
  }

  const extendInstruction2 = await extendLookupTable(
    user,
    lookupTableAddress,
    addresses2
  )

  const instruction2 = [extendInstruction2]
  await sendTransaction(connection, user, instruction2)

  await new Promise((resolve) => setTimeout(resolve, 5000))

  const lookupTableAccount = await connection
    .getAddressLookupTable(lookupTableAddress)
    .then((res) => res.value)

  if (lookupTableAccount) {
    const transferInstructions = await createTransferInstructions(
      connection,
      lookupTableAccount,
      user
    )

    await sendTransaction(connection, user, transferInstructions, [
      lookupTableAccount,
    ])
  }
}

async function createLookupTable(
  user: web3.Keypair,
  connection: web3.Connection
): Promise<[web3.TransactionInstruction, web3.PublicKey]> {
  const slot = await connection.getSlot()
  const [lookupTableInst, lookupTableAddress] =
    web3.AddressLookupTableProgram.createLookupTable({
      authority: user.publicKey,
      payer: user.publicKey,
      recentSlot: slot - 10,
    })
  console.log("lookup table address:", lookupTableAddress.toBase58())
  return [lookupTableInst, lookupTableAddress]
}

async function extendLookupTable(
  user: web3.Keypair,
  lookupTableAddress: web3.PublicKey,
  addresses: web3.PublicKey[]
): Promise<web3.TransactionInstruction> {
  const extendInstruction = web3.AddressLookupTableProgram.extendLookupTable({
    payer: user.publicKey,
    authority: user.publicKey,
    lookupTable: lookupTableAddress,
    addresses: addresses,
  })
  return extendInstruction
}

async function createTransferInstructions(
  connection: web3.Connection,
  lookupTableAccount: web3.AddressLookupTableAccount,
  user: web3.Keypair
) {
  const { addresses } = lookupTableAccount.state

  let minRent = await connection.getMinimumBalanceForRentExemption(0)

  const transferInstructions = []

  for (let i = 0; i < addresses.length; i++) {
    transferInstructions.push(
      web3.SystemProgram.transfer({
        fromPubkey: user.publicKey,
        toPubkey: addresses[i],
        lamports: minRent,
      })
    )
  }

  return transferInstructions
}

async function sendTransaction(
  connection: web3.Connection,
  user: web3.Keypair,
  instructions: web3.TransactionInstruction[],
  lookupTableAccounts?: web3.AddressLookupTableAccount[]
) {
  const { lastValidBlockHeight, blockhash } =
    await connection.getLatestBlockhash()

  const messageV0 = new web3.TransactionMessage({
    payerKey: user.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(lookupTableAccounts ? lookupTableAccounts : undefined)

  const transaction = new web3.VersionedTransaction(messageV0)

  transaction.sign([user])

  const txid = await connection.sendTransaction(transaction)

  await connection.confirmTransaction({
    blockhash: blockhash,
    lastValidBlockHeight: lastValidBlockHeight,
    signature: txid,
  })

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
