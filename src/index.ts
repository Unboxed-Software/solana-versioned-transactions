import { initializeKeypair } from "./initializeKeypair"
import * as web3 from "@solana/web3.js"

async function main() {
  const connection = new web3.Connection(web3.clusterApiUrl("devnet"))
  const user = await initializeKeypair(connection)

  console.log("PublicKey:", user.publicKey.toBase58())

  let minRent = await connection.getMinimumBalanceForRentExemption(0)
  let blockhash = await connection
    .getLatestBlockhash()
    .then((res) => res.blockhash)

  // const instructions = [
  //   web3.SystemProgram.transfer({
  //     fromPubkey: user.publicKey,
  //     toPubkey: new web3.PublicKey(
  //       "Gqu7KLHnkdMrtfAN8TqQGU4o1PvXA2X4VTNkF4ok4t78"
  //     ),
  //     lamports: minRent,
  //   }),
  // ]

  // const messageV0 = new web3.TransactionMessage({
  //   payerKey: user.publicKey,
  //   recentBlockhash: blockhash,
  //   instructions,
  // }).compileToV0Message()

  // const transaction = new web3.VersionedTransaction(messageV0)

  // transaction.sign([user])

  // const txid = await connection.sendTransaction(transaction)
  // console.log(`https://explorer.solana.com/tx/${txid}?cluster=devnet`)

  const slot = await connection.getSlot()

  const [lookupTableInst, lookupTableAddress] =
    web3.AddressLookupTableProgram.createLookupTable({
      authority: user.publicKey,
      payer: user.publicKey,
      recentSlot: slot,
    })

  console.log("lookup table address:", lookupTableAddress.toBase58())

  const instructions = [lookupTableInst]

  // create v0 compatible message
  const messageV0 = new web3.TransactionMessage({
    payerKey: user.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message()

  const transaction = new web3.VersionedTransaction(messageV0)

  // sign your transaction with the required `Signers`
  transaction.sign([user])

  const txid = await connection.sendTransaction(transaction)
  await connection.confirmTransaction(txid)
  console.log(`https://explorer.solana.com/tx/${txid}?cluster=devnet`)

  const extendInstruction = web3.AddressLookupTableProgram.extendLookupTable({
    payer: user.publicKey,
    authority: user.publicKey,
    lookupTable: lookupTableAddress,
    addresses: [user.publicKey],
  })

  const instructions2 = [extendInstruction]

  const messageV02 = new web3.TransactionMessage({
    payerKey: user.publicKey,
    recentBlockhash: blockhash,
    instructions: instructions2,
  }).compileToV0Message()

  const transaction2 = new web3.VersionedTransaction(messageV02)

  transaction2.sign([user])

  const txid2 = await connection.sendTransaction(transaction2)
  console.log(`https://explorer.solana.com/tx/${txid2}?cluster=devnet`)
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
