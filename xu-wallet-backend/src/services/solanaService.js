import { Connection, PublicKey } from '@solana/web3.js';

const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com'; // Replace with the desired Solana RPC URL
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

export const fetchSolanaBalance = async (publicKeyString) => {
    try {
        const publicKey = new PublicKey(publicKeyString);
        const balance = await connection.getBalance(publicKey);
        return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
        throw new Error('Failed to fetch Solana balance: ' + error.message);
    }
};

export const fetchSolanaTransactionHistory = async (publicKeyString) => {
    try {
        const publicKey = new PublicKey(publicKeyString);
        const signatures = await connection.getConfirmedSignaturesForAddress2(publicKey);
        const transactions = await Promise.all(
            signatures.map(async (signatureInfo) => {
                const transaction = await connection.getTransaction(signatureInfo.signature);
                return transaction;
            })
        );
        return transactions;
    } catch (error) {
        throw new Error('Failed to fetch Solana transaction history: ' + error.message);
    }
};