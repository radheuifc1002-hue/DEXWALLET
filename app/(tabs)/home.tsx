import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '../../context/WalletContext';
import { SafeAreaView as SafeAreaContextView } from 'react-native-safe-area-context';

const CHAIN_COLORS: Record<string, string> = {
  ethereum: '#627EEA',
  solana: '#9945FF',
  bnb: '#F3BA2F',
  polygon: '#8247E5',
  arbitrum: '#28A0F0', bitcoin: '#F7931A', tron: '#EF0027',
};

const CHAIN_SYMBOLS: Record<string, string> = {
  ethereum: 'ETH',
  solana: 'SOL',
  bnb: 'BNB',
  polygon: 'POL', arbitrum: 'ETH', bitcoin: 'BTC', tron: 'TRX',
};

const CHAIN_ICONS: Record<string, string> = {
  ethereum: 'logo-ethereum',
  solana: 'planet-outline',
  bnb: 'logo-bitcoin',
  polygon: 'triangle-outline', arbitrum: 'layers-outline', bitcoin: 'logo-bitcoin', tron: 'flash-outline',
};

export default function Home() {
  const router = useRouter();
  const {
    walletAddresses,
    selectedBlockchain,
    setSelectedBlockchain,
    tokens,
    isLoadingBalances,
    refreshBalances,
    walletAddress,
    activeWallet,
    activeVault,
    walletVaultStore,
    selectWalletAccount,
  } = useWallet();

  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [chainPickerVisible, setChainPickerVisible] = useState(false);
  const [walletPickerVisible, setWalletPickerVisible] = useState(false);
  const [switchingWalletId, setSwitchingWalletId] = useState<string | null>(null);

  const activeWalletHasChainAddress = Boolean(activeWallet?.addresses[selectedBlockchain]?.trim());
  const visibleTokens = tokens.filter((token) => token.blockchain === selectedBlockchain).sort((a, b) => Number(Boolean(a.contractAddress)) - Number(Boolean(b.contractAddress)) || (b.balanceUSD || 0) - (a.balanceUSD || 0));
  const totalUSD = visibleTokens.reduce((s, t) => s + (!t.contractAddress ? (t.balanceUSD || 0) : 0), 0);

  const handleWalletSelect = async (vaultId: string, accountId: string) => {
    if (walletVaultStore?.activeAccountId === accountId) { setWalletPickerVisible(false); return; }
    setSwitchingWalletId(accountId);
    try {
      await selectWalletAccount(vaultId, accountId);
      setWalletPickerVisible(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert('Unable to switch wallet', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSwitchingWalletId(null); }
  };

  const handleCopy = async () => {
    if (!walletAddress) return;
    await Clipboard.setStringAsync(walletAddress);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    refreshBalances();
    setTimeout(() => setRefreshing(false), 1500);
  }, [refreshBalances]);

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}`
    : '';

  const CHAINS: Array<'ethereum' | 'solana' | 'bnb' | 'polygon' | 'arbitrum' | 'bitcoin' | 'tron'> = ['ethereum','solana','bnb','polygon','arbitrum','bitcoin','tron'];

  return (
    <SafeAreaContextView edges={["top"]} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6C4CF1"
          />
        }
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>XU Wallet</Text>
            <TouchableOpacity style={styles.walletSelector} onPress={() => setWalletPickerVisible(true)} activeOpacity={0.75}>
              <Ionicons name="wallet" size={15} color="#6C4CF1" />
              <Text style={styles.walletSelectorName}>{activeWalletHasChainAddress ? activeWallet?.name : 'Select wallet on this chain'}</Text>
              {activeWalletHasChainAddress && activeWallet?.sourceType === 'watch-only' ? <Text style={styles.homeWatchBadge}>WATCH</Text> : null}
              <Text style={styles.walletSelectorVault}>{activeVault?.name || ''}</Text>
              <Ionicons name="chevron-down" size={14} color="#6C4CF1" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.chainPicker}
            onPress={() => setChainPickerVisible(true)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Select blockchain"
          >
            <View style={[styles.chainPickerDot, { backgroundColor: CHAIN_COLORS[selectedBlockchain] || '#6C4CF1' }]} />
            <Text style={styles.chainPickerText}>{CHAIN_SYMBOLS[selectedBlockchain] || 'ETH'}</Text>
            <Ionicons name="chevron-down" size={16} color="#6C4CF1" />
          </TouchableOpacity>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Native-coin value</Text>
          <Text style={styles.balanceAmount}>
            ${totalUSD.toFixed(2)}
          </Text>

          <TouchableOpacity style={styles.addressRow} onPress={handleCopy}>
            <Ionicons
              name="wallet-outline"
              size={14}
              color="#9B97B2"
            />
            <Text style={styles.address}>{shortAddr || '—'}</Text>
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={14}
              color={copied ? '#10B981' : '#9B97B2'}
            />
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push('/send')}
              disabled={activeWallet?.sourceType === 'watch-only'}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIcon, activeWallet?.sourceType === 'watch-only' && { opacity: 0.35 }]}>
                <Ionicons name="arrow-up" size={20} color="#fff" />
              </View>
              <Text style={[styles.actionLabel, activeWallet?.sourceType === 'watch-only' && { opacity: 0.4 }]}>Send</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push('/receive')}
              activeOpacity={0.8}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="arrow-down" size={20} color="#fff" />
              </View>
              <Text style={styles.actionLabel}>Receive</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Modal
          visible={chainPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setChainPickerVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={styles.modalDismiss} activeOpacity={1} onPress={() => setChainPickerVisible(false)} />
            <View style={styles.chainModal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select network</Text>
                <TouchableOpacity onPress={() => setChainPickerVisible(false)} hitSlop={10}>
                  <Ionicons name="close" size={22} color="#777286" />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalSubtitle}>Choose which blockchain to view</Text>
              {CHAINS.map((chain) => (
                <TouchableOpacity
                  key={chain}
                  style={[styles.chainOption, selectedBlockchain === chain && styles.chainOptionActive]}
                  onPress={() => {
                    setSelectedBlockchain(chain);
                    setChainPickerVisible(false);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.chainOptionIcon, { backgroundColor: (CHAIN_COLORS[chain] || '#6C4CF1') + '20' }]}>
                    <Ionicons name={(CHAIN_ICONS[chain] as any) || 'ellipse-outline'} size={21} color={CHAIN_COLORS[chain]} />
                  </View>
                  <View style={styles.chainOptionTextWrap}>
                    <Text style={styles.chainOptionName}>{chain === 'bnb' ? 'BNB Chain' : chain === 'polygon' ? 'Polygon' : chain === 'arbitrum' ? 'Arbitrum' : chain === 'bitcoin' ? 'Bitcoin' : chain === 'tron' ? 'TRON' : chain === 'ethereum' ? 'Ethereum' : 'Solana'}</Text>
                    <Text style={styles.chainOptionSymbol}>{CHAIN_SYMBOLS[chain]}</Text>
                  </View>
                  {selectedBlockchain === chain && <Ionicons name="checkmark-circle" size={22} color="#6C4CF1" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>

        <Modal
          visible={walletPickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setWalletPickerVisible(false)}
        >
          <View style={styles.walletModalOverlay}>
            <TouchableOpacity style={styles.modalDismiss} activeOpacity={1} onPress={() => setWalletPickerVisible(false)} />
            <View style={styles.walletModal}>
              <View style={styles.walletModalHeader}>
                <View><Text style={styles.walletModalTitle}>Your wallets</Text><Text style={styles.walletModalSubtitle}>Choose which wallet to view on {CHAIN_SYMBOLS[selectedBlockchain]}</Text></View>
                <TouchableOpacity onPress={() => setWalletPickerVisible(false)} hitSlop={10}><Ionicons name="close" size={22} color="#777286" /></TouchableOpacity>
              </View>
              <ScrollView style={styles.walletList} showsVerticalScrollIndicator={false}>
                {(walletVaultStore?.vaults ?? []).map((vault) => {
                  const chainAccounts = vault.accounts.filter((account) => Boolean(account.addresses[selectedBlockchain]?.trim()));
                  if (!chainAccounts.length) return null;
                  return (
                    <View key={vault.id} style={styles.walletGroup}>
                      <View style={styles.walletGroupHeader}><Text style={styles.walletGroupName}>{vault.name}</Text><Text style={styles.walletGroupCount}>{chainAccounts.length} {chainAccounts.length === 1 ? 'wallet' : 'wallets'}</Text></View>
                      {chainAccounts.map((account) => {
                        const isActive = walletVaultStore?.activeAccountId === account.id;
                        const address = account.addresses[selectedBlockchain] ?? '';
                        const shortAddress = address.slice(0, 8) + '…' + address.slice(-6);
                        return (
                          <TouchableOpacity key={account.id} style={[styles.walletChoice, isActive && styles.walletChoiceActive]} onPress={() => void handleWalletSelect(vault.id, account.id)} disabled={switchingWalletId !== null} activeOpacity={0.75}>
                            <View style={[styles.walletChoiceIcon, account.sourceType === 'watch-only' && styles.watchChoiceIcon]}><Ionicons name={account.sourceType === 'watch-only' ? 'eye-outline' : 'wallet-outline'} size={19} color={account.sourceType === 'watch-only' ? '#0D9488' : '#6C4CF1'} /></View>
                            <View style={styles.walletChoiceInfo}>
                              <View style={styles.walletChoiceNameRow}><Text style={styles.walletChoiceName}>{account.name}</Text>{account.sourceType === 'watch-only' ? <Text style={styles.watchChoiceBadge}>WATCH</Text> : null}</View>
                              <Text style={styles.walletChoiceAddress}>{shortAddress}</Text>
                            </View>
                            {switchingWalletId === account.id ? <Ionicons name="sync" size={19} color="#6C4CF1" /> : isActive ? <Ionicons name="checkmark-circle" size={21} color="#6C4CF1" /> : <Ionicons name="chevron-forward" size={18} color="#9B97A8" />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })}
                {!((walletVaultStore?.vaults ?? []).some((vault) => vault.accounts.some((account) => Boolean(account.addresses[selectedBlockchain]?.trim())))) ? <Text style={styles.walletGroupEmpty}>No wallets have an address on {CHAIN_SYMBOLS[selectedBlockchain]}. Add or import one for this chain.</Text> : null}
                {(walletVaultStore?.vaults ?? []).length === 0 ? <Text style={styles.walletGroupEmpty}>No wallets available. Add a wallet to get started.</Text> : null}
              </ScrollView>
            </View>
          </View>
        </Modal>
        <View style={styles.assetsHeader}>
          <View><Text style={styles.sectionTitle}>Assets</Text><Text style={styles.assetsSubtitle}>{visibleTokens.length} assets on this network</Text></View>
          <TouchableOpacity style={styles.importButton} onPress={() => router.push('/import-token')} activeOpacity={0.8}>
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text style={styles.importButtonText}>Import</Text>
          </TouchableOpacity>
        </View>

        {visibleTokens.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={40} color="#4A4760" />
            <Text style={styles.emptyText}>No tokens yet</Text>
          </View>
        ) : (
          visibleTokens.slice(0, 5).map((token) => (
            <TouchableOpacity
              key={token.id}
              style={styles.tokenCard}
              activeOpacity={0.8}
              onPress={() => router.push({
                pathname: '/asset-details',
                params: {
                  assetId: token.id,
                  name: token.name,
                  symbol: token.symbol,
                  blockchain: token.blockchain,
                  contractAddress: token.contractAddress || '',
                  decimals: String(token.decimals ?? 18),
                  isNative: token.contractAddress ? 'false' : 'true',
                },
              })}
              accessibilityRole="button"
              accessibilityLabel={'Open ' + token.name + ' asset details and transaction history'}
            >
              <View
                style={[
                  styles.tokenIcon,
                  { backgroundColor: CHAIN_COLORS[token.blockchain] + '22' },
                ]}
              >
                <Ionicons
                  name={(CHAIN_ICONS[token.blockchain] as any) || 'ellipse-outline'}
                  size={22}
                  color={CHAIN_COLORS[token.blockchain]}
                />
              </View>
              <View style={styles.tokenInfo}>
                <Text style={styles.tokenName}>{token.name}</Text>
                <Text style={styles.tokenSymbol}>{token.symbol}</Text>
              </View>
              <View style={styles.tokenBalance}>
                <Text style={styles.tokenAmount}>
                  {token.balance.toFixed(4)} {token.symbol}
                </Text>
                <Text style={styles.tokenUSD}>
                  {token.contractAddress ? 'Price unavailable' : '$' + token.balanceUSD.toFixed(2)}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
        {visibleTokens.length > 5 ? (
          <TouchableOpacity style={styles.viewAllCard} onPress={() => router.push('/assets')} activeOpacity={0.8}>
            <View style={styles.viewAllCardIcon}><Ionicons name="grid-outline" size={17} color="#6C4CF1" /></View>
            <View style={{flex:1}}><Text style={styles.viewAllCardTitle}>View all assets</Text><Text style={styles.viewAllCardSubtitle}>{visibleTokens.length - 5} more token{visibleTokens.length - 5 === 1 ? '' : 's'} · Sorted by value</Text></View>
            <Ionicons name="chevron-forward" size={18} color="#6C4CF1" />
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaContextView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { padding: 20, paddingBottom: 32 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#211B35',
  },
  walletSelector: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, paddingVertical: 5, paddingHorizontal: 9, alignSelf: 'flex-start', backgroundColor: '#F3F0FF', borderRadius: 10 },
  walletSelectorName: { color: '#211B35', fontSize: 12, fontWeight: '800', maxWidth: 115 },
  walletSelectorVault: { color: '#777286', fontSize: 10, maxWidth: 80 },
  assetsSubtitle: { color: '#777286', fontSize: 11, marginTop: 3 },
  viewAllCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 2, marginBottom: 10, borderRadius: 16, borderWidth: 1, borderColor: '#E8E4F3', backgroundColor: '#F8F6FF' },
  viewAllCardIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#EEE9FF', alignItems: 'center', justifyContent: 'center' },
  viewAllCardTitle: { color: '#211B35', fontSize: 13, fontWeight: '800' },
  viewAllCardSubtitle: { color: '#777286', fontSize: 11, marginTop: 3 },
  chainPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3F0FF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E4F3',
  },
  chainPickerDot: { width: 8, height: 8, borderRadius: 4 },
  chainPickerText: { color: '#211B35', fontSize: 13, fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 22,
    backgroundColor: 'rgba(20, 16, 38, 0.38)',
  },
  modalDismiss: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  chainModal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E8E4F3',
    elevation: 12,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: '#211B35', fontSize: 20, fontWeight: '800' },
  modalSubtitle: { color: '#777286', fontSize: 13, marginTop: 5, marginBottom: 14 },
  chainOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0EDF7',
    marginTop: 8,
  },
  chainOptionActive: { backgroundColor: '#F8F6FF', borderColor: '#6C4CF1' },
  chainOptionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  chainOptionTextWrap: { flex: 1 },
  chainOptionName: { color: '#211B35', fontSize: 15, fontWeight: '700' },
  chainOptionSymbol: { color: '#777286', fontSize: 12, marginTop: 2 },
  balanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8E4F3',
    shadowColor: '#211B35',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  balanceLabel: {
    color: '#777286',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 40,
    fontWeight: '900',
    color: '#211B35',
    marginBottom: 12,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F0FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  address: {
    color: '#777286',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    minHeight: 54,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#F3F0FF',
    borderWidth: 1,
    borderColor: '#E8E4F3',
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#6C4CF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: '#211B35',
    fontSize: 14,
    fontWeight: '700',
  },
  assetsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  importButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#6C4CF1', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10 },
  importButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  sectionTitle: {
    color: '#211B35',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 0,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyText: { color: '#9A95A8', fontSize: 15 },
  tokenCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  tokenIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tokenInfo: { flex: 1 },
  tokenName: { color: '#211B35', fontSize: 15, fontWeight: '700' },
  tokenSymbol: { color: '#777286', fontSize: 13, marginTop: 2 },
  tokenBalance: { alignItems: 'flex-end' },
  tokenAmount: { color: '#211B35', fontSize: 14, fontWeight: '600' },
  tokenUSD: { color: '#777286', fontSize: 12, marginTop: 2 },
  homeWatchBadge: { color: '#0D9488', backgroundColor: '#E6F7F4', fontSize: 8, fontWeight: '900', paddingHorizontal: 5, paddingVertical: 3, borderRadius: 5 },
  walletModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,16,38,0.45)' },
  walletModal: { maxHeight: '82%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 28 },
  walletModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  walletModalTitle: { color: '#211B35', fontSize: 21, fontWeight: '900' }, walletModalSubtitle: { color: '#777286', fontSize: 12, marginTop: 3 },
  walletList: { flexGrow: 0, marginBottom: 14 }, walletGroup: { marginBottom: 15 },
  walletGroupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3, marginBottom: 7 },
  walletGroupName: { color: '#777286', fontSize: 11, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' }, walletGroupCount: { color: '#A29DAF', fontSize: 10, fontWeight: '600' },
  walletChoice: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: '#F0EDF7', marginBottom: 7 }, walletChoiceActive: { backgroundColor: '#F8F6FF', borderColor: '#6C4CF1' },
  walletChoiceIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#F1EDFF', alignItems: 'center', justifyContent: 'center' }, watchChoiceIcon: { backgroundColor: '#E6F7F4' }, walletChoiceInfo: { flex: 1 },
  walletChoiceNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, walletChoiceName: { color: '#211B35', fontSize: 13, fontWeight: '800' },
  walletChoiceAddress: { color: '#777286', fontSize: 10, fontFamily: 'monospace', marginTop: 4 }, watchChoiceBadge: { color: '#0D9488', backgroundColor: '#E6F7F4', fontSize: 8, fontWeight: '900', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 },
  walletGroupEmpty: { color: '#9B97A8', fontSize: 12, padding: 12 },
});
