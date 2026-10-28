import { generateMnemonic, validateMnemonic } from 'bip39';
import { ethers } from 'ethers';
import { Keypair } from '@solana/web3.js';
import * as SecureStore from 'expo-secure-store';

const EVM_PATH = "m/44'/60'/0'/0/0";
const SOLANA_PATH = "m/44'/501'/0'/0'";

export const createWallet = async () => {
    const mnemonic = generateMnemonic();
    const walletEVM = ethers.Wallet.fromMnemonic(mnemonic);
    const walletSolana = Keypair.generate();

    // Store the wallet securely after confirmation
    return {
        mnemonic,
        walletEVM,
        walletSolana,
    };
};

export const importWallet = async (mnemonic) => {
    if (!validateMnemonic(mnemonic)) {
        throw new Error('Invalid mnemonic');
    }

    const walletEVM = ethers.Wallet.fromMnemonic(mnemonic);
    const walletSolana = Keypair.fromSecretKey(new Uint8Array(32)); // Replace with actual derivation logic

    return {
        walletEVM,
        walletSolana,
    };
};

export const encryptMnemonic = async (mnemonic, pin) => {
    // Implement encryption logic here
    const encryptedMnemonic = /* encryption logic */;
    await SecureStore.setItemAsync('encryptedMnemonic', encryptedMnemonic);
};

export const decryptMnemonic = async (pin) => {
    // Implement decryption logic here
    const encryptedMnemonic = await SecureStore.getItemAsync('encryptedMnemonic');
    const decryptedMnemonic = /* decryption logic */;
    return decryptedMnemonic;
};