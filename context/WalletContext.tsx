import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { refreshWalletTokenBalances } from '../mobile/services/balanceService';
import { initializeWalletVaultStore, clearWalletVaultStore, setActiveWalletAccount as persistActiveWalletAccount, type WalletVaultStore, type WalletAccount, type WalletVault } from '../mobile/services/walletVaultService';
import {
  deriveAddresses,
  saveWalletToStorage,
  loadWalletFromStorage,
  clearWalletFromStorage,
  savePin,
  verifyPin,
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
  verifyPin: (candidate: string) => Promise<boolean>;
  setPin: (value: string) => Promise<void>;
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
  walletVaultStore: WalletVaultStore | null;
  refreshWalletVaultStore: () => Promise<void>;
  activeWallet: WalletAccount | null;
  activeVault: WalletVault | null;
  selectWalletAccount: (vaultId: string, accountId: string) => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const AUTO_LOCK_TIMER_KEY = 'xu_wallet_auto_lock_minutes';
const BACKGROUND_AT_KEY = 'xu_wallet_background_at';
const CUSTOM_TOKENS_KEY = 'xu_wallet_custom_tokens';

const NATIVE_TOKEN_DEFS: { blockchain: Blockchain; id: string; name: string; symbol: string }[] = [
  { blockchain: 'ethereum', id: 'eth', name: 'Ethereum', symbol: 'ETH' },
  { blockchain: 'solana', id: 'sol', name: 'Solana', symbol: 'SOL' },
  { blockchain: 'bnb', id: 'bnb', name: 'BNB', symbol: 'BNB' },
  { blockchain: 'polygon', id: 'matic', name: 'Polygon', symbol: 'MATIC' },
];

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isWalletCreated, setIsWalletCreated] = useState(false);
  const [selectedBlockchain, setSelectedBlockchain] = useState<Blockchain>('ethereum');
  const [network, setNetwork] = useState<Network>('mainnet');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [walletAddresses, setWalletAddresses] = useState<WalletAddresses | null>(null);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [autoLockTimer, setAutoLockTimerState] = useState(5);
  const [isLocked, setIsLockedState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [walletVaultStore, setWalletVaultStore] = useState<WalletVaultStore | null>(null);
  const lastBackgroundAt = React.useRef<number | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const [{ addresses, created, mnemonic }, bio, storedTimer, storedBackgroundAt, storedCustomTokens] = await Promise.all([
          loadWalletFromStorage(),
          getBiometricEnabled(),
          AsyncStorage.getItem(AUTO_LOCK_TIMER_KEY),
          AsyncStorage.getItem(BACKGROUND_AT_KEY),
          AsyncStorage.getItem(CUSTOM_TOKENS_KEY),
        ]);
        const migratedVaultStore = await initializeWalletVaultStore();
        setWalletVaultStore(migratedVaultStore);
        const migratedActive = migratedVaultStore.vaults
          .flatMap((vault) => vault.accounts.map((account) => ({ vault, account })))
          .find(({ account }) => account.id === migratedVaultStore.activeAccountId);
        if (migratedActive) {
          setWalletAddresses({
            ethereum: migratedActive.account.addresses.ethereum ?? '',
            solana: migratedActive.account.addresses.solana ?? '',
            bnb: migratedActive.account.addresses.bnb ?? '',
            polygon: migratedActive.account.addresses.polygon ?? '',
          });
        }
        const parsedTimer = storedTimer === null ? 5 : Number(storedTimer);
        const timer = [0, 1, 5, 15, 30].includes(parsedTimer) ? parsedTimer : 5;
        setAutoLockTimerState(timer);
        const backgroundAt = storedBackgroundAt ? Number(storedBackgroundAt) : null;
        lastBackgroundAt.current = Number.isFinite(backgroundAt) ? backgroundAt : null;
        setBiometricEnabledState(bio);
        if (created && addresses) {
          setIsWalletCreated(true);
          const customTokens = storedCustomTokens ? JSON.parse(storedCustomTokens) as Token[] : [];
          setTokens([...NATIVE_TOKEN_DEFS.map((d) => ({ ...d, balance: 0, balanceUSD: 0 })), ...customTokens]);
          const elapsedMs = lastBackgroundAt.current === null ? Number.POSITIVE_INFINITY : Date.now() - lastBackgroundAt.current;
          setIsLockedState(timer > 0 && lastBackgroundAt.current !== null && Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs >= timer * 60 * 1000);
          lastBackgroundAt.current = null;
          await AsyncStorage.removeItem(BACKGROUND_AT_KEY).catch(() => {});
        }
        const activeAfterHydration = migratedVaultStore.vaults
          .flatMap((vault) => vault.accounts.map((account) => ({ vault, account })))
          .find(({ account }) => account.id === migratedVaultStore.activeAccountId);
        if (activeAfterHydration) {
          setWalletAddresses({
            ethereum: activeAfterHydration.account.addresses.ethereum ?? '',
            solana: activeAfterHydration.account.addresses.solana ?? '',
            bnb: activeAfterHydration.account.addresses.bnb ?? '',
            polygon: activeAfterHydration.account.addresses.polygon ?? '',
          });
        }
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    // Persist the first moment the app leaves the foreground. Do not require
    // a previousState === 'active' check: Android can report an initial
    // 'inactive'/'background' event while AppState.currentState is still null.
    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      if (!isWalletCreated) return;

      if (state !== 'active') {
        if (lastBackgroundAt.current === null) {
          const timestamp = Date.now();
          lastBackgroundAt.current = timestamp;
          await AsyncStorage.setItem(BACKGROUND_AT_KEY, String(timestamp)).catch(() => {});
        }
        return;
      }

      let timestamp = lastBackgroundAt.current;
      if (timestamp === null) {
        const stored = await AsyncStorage.getItem(BACKGROUND_AT_KEY).catch(() => null);
        const parsed = stored === null ? null : Number(stored);
        timestamp = parsed !== null && Number.isFinite(parsed) ? parsed : null;
      }

      const elapsedMs = timestamp === null ? null : Date.now() - timestamp;
      if (
        autoLockTimer > 0 &&
        elapsedMs !== null &&
        elapsedMs >= 0 &&
        elapsedMs >= autoLockTimer * 60 * 1000
      ) {
        setIsLockedState(true);
      }

      lastBackgroundAt.current = null;
      await AsyncStorage.removeItem(BACKGROUND_AT_KEY).catch(() => {});
    });
    return () => sub.remove();
  }, [isWalletCreated, autoLockTimer]);

  const setIsLocked = useCallback((value: boolean) => {
    setIsLockedState(value);
    if (!value) {
      lastBackgroundAt.current = null;
      void AsyncStorage.removeItem(BACKGROUND_AT_KEY).catch(() => {});
    }
  }, []);

  const setAutoLockTimer = useCallback(async (value: number) => {
    const safeValue = [0, 1, 5, 15, 30].includes(value) ? value : 5;
    setAutoLockTimerState(safeValue);
    lastBackgroundAt.current = null;
    await Promise.all([
      AsyncStorage.setItem(AUTO_LOCK_TIMER_KEY, String(safeValue)),
      AsyncStorage.removeItem(BACKGROUND_AT_KEY),
    ]);
  }, []);

  const setPin = useCallback(async (value: string) => {
    await savePin(value);
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
    const vaultStore = await initializeWalletVaultStore();
    setWalletVaultStore(vaultStore);
    const native = NATIVE_TOKEN_DEFS.map((d) => ({ ...d, balance: 0, balanceUSD: 0 }));
    const storedCustom = await AsyncStorage.getItem(CUSTOM_TOKENS_KEY);
    const custom = storedCustom ? JSON.parse(storedCustom) as Token[] : [];
    setTokens([...native, ...custom]);
    setIsWalletCreated(true);
    setIsLocked(false);
    lastBackgroundAt.current = null;
    await AsyncStorage.removeItem(BACKGROUND_AT_KEY).catch(() => {});
  }, [setIsLocked]);

  const refreshBalances = useCallback(async () => {
    if (!walletAddresses || isLocked || !isWalletCreated) return;
    setIsLoadingBalances(true);
    try {
      const refreshed = await refreshWalletTokenBalances(walletAddresses, tokens, network);
      setTokens((current) => current.map((token) => refreshed.find((item) => item.id === token.id) || token));
    } finally {
      setIsLoadingBalances(false);
    }
  }, [walletAddresses, isLocked, isWalletCreated, tokens, network]);

  useEffect(() => {
    if (isWalletCreated && !isLocked && walletAddresses) void refreshBalances();
  }, [isWalletCreated, isLocked, walletAddresses, network]);

  const addToken = useCallback((token: Token) => {
    setTokens((prev) => {
      const exists = prev.some((t) => t.id === token.id);
      const next = exists ? prev.map((t) => t.id === token.id ? token : t) : [...prev, token];
      void AsyncStorage.setItem(CUSTOM_TOKENS_KEY, JSON.stringify(next.filter((t) => Boolean(t.contractAddress))));
      return next;
    });
  }, []);

  const refreshWalletVaultStore = useCallback(async () => {
    const store = await initializeWalletVaultStore();
    setWalletVaultStore(store);
    const active = store.vaults
      .flatMap((vault) => vault.accounts.map((account) => ({ vault, account })))
      .find(({ account }) => account.id === store.activeAccountId);
    if (active) {
      setWalletAddresses({
        ethereum: active.account.addresses.ethereum ?? '',
        solana: active.account.addresses.solana ?? '',
        bnb: active.account.addresses.bnb ?? '',
        polygon: active.account.addresses.polygon ?? '',
      });
    } else {
      setWalletAddresses(null);
    }
    setTokens((current) => current.map((token) => ({ ...token, balance: 0, balanceUSD: 0 })));
  }, []);

  const selectWalletAccount = useCallback(async (vaultId: string, accountId: string) => {
    const store = await persistActiveWalletAccount(vaultId, accountId);
    setWalletVaultStore(store);
    const account = store.vaults.find((vault) => vault.id === vaultId)?.accounts.find((item) => item.id === accountId);
    if (!account) throw new Error('Selected wallet could not be loaded.');
    setWalletAddresses({
      ethereum: account.addresses.ethereum ?? '',
      solana: account.addresses.solana ?? '',
      bnb: account.addresses.bnb ?? '',
      polygon: account.addresses.polygon ?? '',
    });
    setTokens((current) => current.map((token) => ({ ...token, balance: 0, balanceUSD: 0 })));
  }, []);

  const resetWallet = useCallback(async () => {
    await clearWalletFromStorage();
    await clearWalletVaultStore();
    setWalletVaultStore(null);
    await AsyncStorage.removeItem(CUSTOM_TOKENS_KEY);
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
        verifyPin,
        setPin,
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
        walletVaultStore,
        refreshWalletVaultStore,
        activeWallet: walletVaultStore?.vaults.flatMap((vault) => vault.accounts).find((account) => account.id === walletVaultStore.activeAccountId) ?? null,
        activeVault: walletVaultStore?.vaults.find((vault) => vault.id === walletVaultStore.activeVaultId) ?? null,
        selectWalletAccount,
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
