import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  deriveAddresses,
  saveWalletToStorage,
  loadWalletFromStorage,
  clearWalletFromStorage,
  savePin,
  getPin,
  getBiometricEnabled,
  saveBiometricEnabled,
  WalletAddresses,
} from '../mobile/services/walletService';

export type Blockchain = 'solana' | 'ethereum' | 'bnb' | 'polygon';
export type Network = 'mainnet' | 'testnet';

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
  setPin: (value: string) => Promise<void>;
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
  setBiometricEnabled: (value: boolean) => Promise<void>;
  autoLockTimer: number;
  setAutoLockTimer: (value: number) => void;
  isLocked: boolean;
  setIsLocked: (value: boolean) => void;
  resetWallet: () => Promise<void>;
  isLoading: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const NATIVE_TOKEN_DEFS: { blockchain: Blockchain; id: string; name: string; symbol: string }[] = [
  { blockchain: 'ethereum', id: 'eth', name: 'Ethereum', symbol: 'ETH' },
  { blockchain: 'solana', id: 'sol', name: 'Solana', symbol: 'SOL' },
  { blockchain: 'bnb', id: 'bnb', name: 'BNB', symbol: 'BNB' },
  { blockchain: 'polygon', id: 'matic', name: 'Polygon', symbol: 'MATIC' },
];

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isWalletCreated, setIsWalletCreated] = useState(false);
  const [pin, setPinState] = useState<string | null>(null);
  const [seedPhrase, setSeedPhrase] = useState<string[]>([]);
  const [selectedBlockchain, setSelectedBlockchain] = useState<Blockchain>('ethereum');
  const [network, setNetwork] = useState<Network>('mainnet');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [walletAddresses, setWalletAddresses] = useState<WalletAddresses | null>(null);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [autoLockTimer, setAutoLockTimer] = useState(5);
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const [storedPin, { addresses, created, mnemonic }, bio] = await Promise.all([
          getPin(),
          loadWalletFromStorage(),
          getBiometricEnabled(),
        ]);
        setPinState(storedPin);
        setBiometricEnabledState(bio);
        if (created && addresses) {
          setIsWalletCreated(true);
          setWalletAddresses(addresses);
          if (mnemonic) setSeedPhrase(mnemonic.split(' '));
          setTokens(NATIVE_TOKEN_DEFS.map((d) => ({ ...d, balance: 0, balanceUSD: 0 })));
          setIsLocked(true);
        }
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' && isWalletCreated && autoLockTimer > 0) {
        setIsLocked(true);
      }
    });
    return () => sub.remove();
  }, [isWalletCreated, autoLockTimer]);

  const setPin = useCallback(async (value: string) => {
    await savePin(value);
    setPinState(value);
  }, []);

  const setBiometricEnabled = useCallback(async (value: boolean) => {
    await saveBiometricEnabled(value);
    setBiometricEnabledState(value);
  }, []);

  const walletAddress = walletAddresses ? walletAddresses[selectedBlockchain] ?? '' : '';

  const initWallet = useCallback(async (mnemonic: string) => {
    const addresses = await deriveAddresses(mnemonic);
    setWalletAddresses(addresses);
    await saveWalletToStorage(addresses, mnemonic);
    setSeedPhrase(mnemonic.split(' '));
    const native = NATIVE_TOKEN_DEFS.map((d) => ({ ...d, balance: 0, balanceUSD: 0 }));
    setTokens(native);
    setIsWalletCreated(true);
    setIsLocked(false);
  }, []);

  const refreshBalances = useCallback(() => {}, []);

  const addToken = useCallback((token: Token) => {
    setTokens((prev) => {
      if (prev.find((t) => t.id === token.id)) return prev;
      return [...prev, token];
    });
  }, []);

  const resetWallet = useCallback(async () => {
    await clearWalletFromStorage();
    setPinState(null);
    setSeedPhrase([]);
    setWalletAddresses(null);
    setTokens([]);
    setIsWalletCreated(false);
    setBiometricEnabledState(false);
    setIsLocked(false);
  }, []);

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
        biometricEnabled,
        setBiometricEnabled,
        autoLockTimer,
        setAutoLockTimer,
        isLocked,
        setIsLocked,
        resetWallet,
        isLoading,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
