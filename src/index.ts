import * as web3 from "@solana/web3.js";
import { makeKeypairs, getExplorerLink } from "@solana-developers/helpers";
import { initializeKeypair } from "./initializeKeypair";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  // Connect to the local Solana cluster
  const connection = new web3.Connection(web3.clusterApiUrl("devnet"), "confirmed");

  // Initialize the keypair from the environment variable or create a new one
  const payer = await initializeKeypair(connection);

  // Generate 22 recipient keypairs using makeKeypairs
  const recipients = makeKeypairs(22).map(keypair => keypair.publicKey);

  // Create a legacy transaction
  const transaction = new web3.Transaction();

  // Add 22 transfer instructions to the transaction
  recipients.forEach((recipient) => {
    transaction.add(
      web3.SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: recipient,
        lamports: web3.LAMPORTS_PER_SOL * 0.01, // Transfer 0.01 SOL to each recipient
      })
    );
  });

  // Sign and send the transaction
  try {
    const signature = await web3.sendAndConfirmTransaction(connection, transaction, [payer]);
    console.log(`Transaction successful with signature: ${getExplorerLink('tx', signature, 'devnet')}`);
  } catch (error) {
    console.error("Transaction failed:", error);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
