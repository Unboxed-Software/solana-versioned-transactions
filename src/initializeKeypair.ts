import * as web3 from "@solana/web3.js";
import * as fs from "fs/promises";
import dotenv from "dotenv";
dotenv.config();

export async function initializeKeypair(
  connection: web3.Connection
): Promise<web3.Keypair> {
  if (!process.env.PRIVATE_KEY) {
    console.log("Creating .env file");
    const signer = web3.Keypair.generate();
    await fs.writeFile(".env", `PRIVATE_KEY=[${signer.secretKey.toString()}]`);
    await airdropSolIfNeeded(signer, connection);

    return signer;
  }

  let secret: number[];
  try {
    secret = JSON.parse(process.env.PRIVATE_KEY) as number[];
  } catch (error) {
    throw new Error("Failed to parse PRIVATE_KEY from .env file");
  }

  const secretKey = Uint8Array.from(secret);
  const keypairFromSecretKey = web3.Keypair.fromSecretKey(secretKey);
  await airdropSolIfNeeded(keypairFromSecretKey, connection);
  return keypairFromSecretKey;
}

export async function airdropSolIfNeeded(
  signer: web3.Keypair,
  connection: web3.Connection
): Promise<void> {
  const balance = await connection.getBalance(signer.publicKey);
  console.log("Current balance is", balance / web3.LAMPORTS_PER_SOL);

  if (balance < web3.LAMPORTS_PER_SOL) {
    console.log("Airdropping 1 SOL...");
    const airdropSignature = await connection.requestAirdrop(signer.publicKey, web3.LAMPORTS_PER_SOL);

    const latestBlockHash = await connection.getLatestBlockhash();

    await connection.confirmTransaction(
      {
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: airdropSignature,
      },
      "finalized"
    );

    const newBalance = await connection.getBalance(signer.publicKey);
    console.log("New balance is", newBalance / web3.LAMPORTS_PER_SOL);
  }
}
