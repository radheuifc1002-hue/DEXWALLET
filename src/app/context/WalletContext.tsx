import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  deriveAddresses,
  saveWalletToStorage,
  loadWalletFromStorage,
  clearWalletFromStorage,
  WalletAddresses,
} from "../services/walletService";
import { fetchEvmNativeBalance, fetchSolanaBalance } from "../services/balanceService";

export type Blockchain = "solana" | "ethereum" | "bnb" | "polygon";
export type Network = "mainnet" | "testnet";

export interface Token {
  id: string;
  name: string;
  symbol: string;
  balance: number;
  balanceUSD: number;
  contractAddress?: string;
  decimals?: number;
  logo?: string;
  blockchain: Blockchain;
}

interface WalletContextType {
  isWalletCreated: boolean;
  setIsWalletCreated: (value: boolean) => void;
  pin: string | null;
  setPin: (value: string | null) => void;
  seedPhrase: string[];
  setSeedPhrase: (value: string[]) => void;
  selectedBlockchain: Blockchain;
  setSelectedBlockchain: (value: Blockchain) => void;
  network: Network;
  setNetwork: (value: Network) => void;
  tokens: Token[];
  addToken: (token: Token) => void;
  walletAddress: string;
  walletAddresses: WalletAddresses | null;
  initWallet: (mnemonic: string) => Promise<void>;
  isLoadingBalances: boolean;
  refreshBalances: () => void;
  biometricEnabled: boolean;
  setBiometricEnabled: (value: boolean) => void;
  autoLockTimer: number;
  setAutoLockTimer: (value: number) => void;
  isLocked: boolean;
  setIsLocked: (value: boolean) => void;
  resetWallet: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const NATIVE_TOKEN_DEFS: { blockchain: Blockchain; id: string; name: string; symbol: string }[] = [
  { blockchain: "ethereum", id: "eth", name: "Ethereum", symbol: "ETH" },
  { blockchain: "solana", id: "sol", name: "Solana", symbol: "SOL" },
  { blockchain: "bnb", id: "bnb", name: "BNB", symbol: "BNB" },
  { blockchain: "polygon", id: "matic", name: "Polygon", symbol: "MATIC" },
];

const PIN_STORAGE_KEY = "xu_wallet_pin";
const BIOMETRIC_STORAGE_KEY = "xu_biometric_enabled";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isWalletCreated, setIsWalletCreated] = useState(false);
  const [pin, setPinState] = useState<string | null>(() => {
    return localStorage.getItem(PIN_STORAGE_KEY) ?? null;
  });
  const [seedPhrase, setSeedPhrase] = useState<string[]>([]);
  const [selectedBlockchain, setSelectedBlockchain] = useState<Blockchain>("ethereum");
  const [network, setNetwork] = useState<Network>("mainnet");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [walletAddresses, setWalletAddresses] = useState<WalletAddresses | null>(null);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [biometricEnabledState, setBiometricEnabledState] = useState<boolean>(
    () => localStorage.getItem(BIOMETRIC_STORAGE_KEY) === "true"
  );
  const [autoLockTimer, setAutoLockTimer] = useState(5);
  const [isLocked, setIsLocked] = useState(false);

  const setPin = useCallback((value: string | null) => {
    if (value === null) {
      localStorage.removeItem(PIN_STORAGE_KEY);
    } else {
      localStorage.setItem(PIN_STORAGE_KEY, value);
    }
    setPinState(value);
  }, []);

  const setBiometricEnabled = useCallback((value: boolean) => {
    localStorage.setItem(BIOMETRIC_STORAGE_KEY, String(value));
    setBiometricEnabledState(value);
  }, []);

  const resetWallet = useCallback(() => {
    clearWalletFromStorage();
    setPinState(null);
    setSeedPhrase([]);
    setWalletAddresses(null);
    setTokens([]);
    setIsWalletCreated(false);
    setBiometricEnabledState(false);
    setIsLocked(false);
  }, []);

  const walletAddress = walletAddresses ? walletAddresses[selectedBlockchain] ?? "" : "";

  const fetchNativeBalances = useCallback(async (addresses: WalletAddresses) => {
    setIsLoadingBalances(true);
    try {
      const [ethBal, solBal, bnbBal, maticBal] = await Promise.all([
        fetchEvmNativeBalance(addresses.ethereum, "ethereum"),
        fetchSolanaBalance(addresses.solana),
        fetchEvmNativeBalance(addresses.bnb, "bnb"),
        fetchEvmNativeBalance(addresses.polygon, "polygon"),
      ]);

      setTokens((prev) => {
        const customTokens = prev.filter((t) => t.contractAddress);
        const nativeTokens: Token[] = NATIVE_TOKEN_DEFS.map((def) => {
          const balMap: Record<string, { balance: number; balanceUSD: number }> = {
            ethereum: ethBal,
            solana: solBal,
            bnb: bnbBal,
            polygon: maticBal,
          };
          const { balance, balanceUSD } = balMap[def.blockchain];
          return { ...def, balance, balanceUSD };
        });
        return [...nativeTokens, ...customTokens];
      });
    } catch (e) {
      console.error("Balance fetch error:", e);
    } finally {
      setIsLoadingBalances(false);
    }
  }, []);

  const initWallet = useCallback(
    async (mnemonic: string) => {
      const addresses = await deriveAddresses(mnemonic);
      setWalletAddresses(addresses);
      saveWalletToStorage(addresses);
      setTokens(
        NATIVE_TOKEN_DEFS.map((def) => ({ ...def, balance: 0, balanceUSD: 0 }))
      );
      fetchNativeBalances(addresses);
    },
    [fetchNativeBalances]
  );

  const refreshBalances = useCallback(() => {
    if (walletAddresses) fetchNativeBalances(walletAddresses);
  }, [walletAddresses, fetchNativeBalances]);

  const addToken = (token: Token) => {
    setTokens((prev) => {
      const exists = prev.find((t) => t.id === token.id);
      if (exists) return prev;
      return [...prev, token];
    });
  };

  useEffect(() => {
    const { addresses, created } = loadWalletFromStorage();
    if (created && addresses) {
      setIsWalletCreated(true);
      setWalletAddresses(addresses);
      const nativeTokens: Token[] = NATIVE_TOKEN_DEFS.map((def) => ({
        ...def,
        balance: 0,
        balanceUSD: 0,
      }));
      setTokens(nativeTokens);
      fetchNativeBalances(addresses);
    }
  }, [fetchNativeBalances]);

  useEffect(() => {
    if (isWalletCreated && !isLocked && autoLockTimer > 0) {
      const timer = setTimeout(() => {
        setIsLocked(true);
      }, autoLockTimer * 60 * 1000);
      return () => clearTimeout(timer);
    }
  }, [isWalletCreated, isLocked, autoLockTimer]);

  return (
    <WalletContext.Provider
      value={{
        isWalletCreated,
        setIsWalletCreated,
        pin,
        setPin,
        seedPhrase,
        setSeedPhrase,
        selectedBlockchain,
        setSelectedBlockchain,
        network,
        setNetwork,
        tokens,
        addToken,
        walletAddress,
        walletAddresses,
        initWallet,
        isLoadingBalances,
        refreshBalances,
        biometricEnabled: biometricEnabledState,
        setBiometricEnabled,
        autoLockTimer,
        setAutoLockTimer,
        isLocked,
        setIsLocked,
        resetWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
