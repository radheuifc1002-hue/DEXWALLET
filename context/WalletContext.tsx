import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const AUTO_LOCK_TIMER_KEY = 'xu_wallet_auto_lock_minutes';
const BACKGROUND_AT_KEY = 'xu_wallet_background_at';

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
  const [autoLockTimer, setAutoLockTimerState] = useState(5);
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const lastBackgroundAt = React.useRef<number | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const [storedPin, { addresses, created, mnemonic }, bio, storedTimer, storedBackgroundAt] = await Promise.all([
          getPin(),
          loadWalletFromStorage(),
          getBiometricEnabled(),
          AsyncStorage.getItem(AUTO_LOCK_TIMER_KEY),
          AsyncStorage.getItem(BACKGROUND_AT_KEY),
        ]);
        const parsedTimer = storedTimer === null ? 5 : Number(storedTimer);
        const timer = [0, 1, 5, 15, 30].includes(parsedTimer) ? parsedTimer : 5;
        setAutoLockTimerState(timer);
        const backgroundAt = storedBackgroundAt ? Number(storedBackgroundAt) : null;
        lastBackgroundAt.current = Number.isFinite(backgroundAt) ? backgroundAt : null;
        setPinState(storedPin);
        setBiometricEnabledState(bio);
        if (created && addresses) {
          setIsWalletCreated(true);
          setWalletAddresses(addresses);
          if (mnemonic) setSeedPhrase(mnemonic.split(' '));
          setTokens(NATIVE_TOKEN_DEFS.map((d) => ({ ...d, balance: 0, balanceUSD: 0 })));
          const elapsedMs = lastBackgroundAt.current === null ? Number.POSITIVE_INFINITY : Date.now() - lastBackgroundAt.current;
          setIsLocked(timer > 0 && elapsedMs >= timer * 60 * 1000);
        }
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      if (!isWalletCreated) return;
      if (state === 'background' || state === 'inactive') {
        const timestamp = Date.now();
        lastBackgroundAt.current = timestamp;
        await AsyncStorage.setItem(BACKGROUND_AT_KEY, String(timestamp)).catch(() => {});
        return;
      }
      if (state === 'active') {
        let timestamp = lastBackgroundAt.current;
        if (timestamp === null) {
          const stored = await AsyncStorage.getItem(BACKGROUND_AT_KEY).catch(() => null);
          timestamp = stored ? Number(stored) : null;
        }
        if (autoLockTimer > 0 && timestamp !== null && Number.isFinite(timestamp) && Date.now() - timestamp >= autoLockTimer * 60 * 1000) {
          setIsLocked(true);
        }
        lastBackgroundAt.current = null;
        await AsyncStorage.removeItem(BACKGROUND_AT_KEY).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [isWalletCreated, autoLockTimer]);

  const setAutoLockTimer = useCallback(async (value: number) => {
    const safeValue = [0, 1, 5, 15, 30].includes(value) ? value : 5;
    setAutoLockTimerState(safeValue);
    await AsyncStorage.setItem(AUTO_LOCK_TIMER_KEY, String(safeValue));
  }, []);

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
