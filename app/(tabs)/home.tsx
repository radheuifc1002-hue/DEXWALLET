import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '../../context/WalletContext';

const CHAIN_COLORS: Record<string, string> = {
  ethereum: '#627EEA',
  solana: '#9945FF',
  bnb: '#F3BA2F',
  polygon: '#8247E5',
};

const CHAIN_SYMBOLS: Record<string, string> = {
  ethereum: 'ETH',
  solana: 'SOL',
  bnb: 'BNB',
  polygon: 'MATIC',
};

const CHAIN_ICONS: Record<string, string> = {
  ethereum: 'logo-ethereum',
  solana: 'planet-outline',
  bnb: 'logo-bitcoin',
  polygon: 'triangle-outline',
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
  } = useWallet();

  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [chainPickerVisible, setChainPickerVisible] = useState(false);

  const totalUSD = tokens.reduce((s, t) => s + (t.balanceUSD || 0), 0);

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

  const CHAINS: Array<'ethereum' | 'solana' | 'bnb' | 'polygon'> = [
    'ethereum',
    'solana',
    'bnb',
    'polygon',
  ];

  return (
    <SafeAreaView style={styles.container}>
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
          <Text style={styles.headerTitle}>XU Wallet</Text>
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
          <Text style={styles.balanceLabel}>Total Portfolio</Text>
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
              activeOpacity={0.8}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="arrow-up" size={20} color="#fff" />
              </View>
              <Text style={styles.actionLabel}>Send</Text>
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chainTabs}
        >
          {CHAINS.map((chain) => (
            <TouchableOpacity
              key={chain}
              style={[
                styles.chainTab,
                selectedBlockchain === chain && styles.chainTabActive,
              ]}
              onPress={() => setSelectedBlockchain(chain)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chainTabText,
                  selectedBlockchain === chain && { color: '#211B35' },
                ]}
              >
                {CHAIN_SYMBOLS[chain]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>Assets</Text>

        {tokens.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={40} color="#4A4760" />
            <Text style={styles.emptyText}>No tokens yet</Text>
          </View>
        ) : (
          tokens.map((token) => (
            <TouchableOpacity
              key={token.id}
              style={styles.tokenCard}
              activeOpacity={0.8}
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
                  ${token.balanceUSD.toFixed(2)}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
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
  sectionTitle: {
    color: '#211B35',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
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
});
