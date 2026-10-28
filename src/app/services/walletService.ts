import * as bip39 from "bip39";
import { ethers } from "ethers";
import * as ed from "@noble/ed25519";
import bs58 from "bs58";

export interface WalletAddresses {
  ethereum: string;
  solana: string;
  bnb: string;
  polygon: string;
}

export const generateMnemonic = (): string => {
  return bip39.generateMnemonic(128);
};

export const validateMnemonic = (mnemonic: string): boolean => {
  return bip39.validateMnemonic(mnemonic.trim().toLowerCase());
};

export const deriveAddresses = async (mnemonic: string): Promise<WalletAddresses> => {
  const evmWallet = ethers.Wallet.fromPhrase(mnemonic.trim());
  const evmAddress = evmWallet.address;

  const seed = bip39.mnemonicToSeedSync(mnemonic.trim());
  const solanaSeed = seed.slice(0, 32);
  const solanaPubKey = await ed.getPublicKeyAsync(solanaSeed);
  const solanaAddress = bs58.encode(solanaPubKey);

  return {
    ethereum: evmAddress,
    bnb: evmAddress,
    polygon: evmAddress,
    solana: solanaAddress,
  };
};

export const saveWalletToStorage = (addresses: WalletAddresses) => {
  localStorage.setItem("xu_wallet_addresses", JSON.stringify(addresses));
  localStorage.setItem("xu_wallet_created", "true");
};

export const loadWalletFromStorage = (): { addresses: WalletAddresses | null; created: boolean } => {
  const created = localStorage.getItem("xu_wallet_created") === "true";
  const raw = localStorage.getItem("xu_wallet_addresses");
  const addresses = raw ? (JSON.parse(raw) as WalletAddresses) : null;
  return { addresses, created };
};

export const clearWalletFromStorage = () => {
  localStorage.removeItem("xu_wallet_addresses");
  localStorage.removeItem("xu_wallet_created");
  localStorage.removeItem("xu_wallet_pin");
  localStorage.removeItem("xu_biometric_enabled");
  localStorage.removeItem("xu_biometric_credential_id");
};
