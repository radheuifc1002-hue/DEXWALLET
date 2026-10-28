import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
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
          <View style={styles.networkBadge}>
            <View style={styles.networkDot} />
            <Text style={styles.networkText}>Mainnet</Text>
          </View>
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
                  selectedBlockchain === chain && { color: '#FFFFFF' },
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
  container: { flex: 1, backgroundColor: '#0F0E17' },
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
    color: '#FFFFFF',
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1A1825',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  networkDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  networkText: { color: '#9B97B2', fontSize: 12, fontWeight: '600' },
  balanceCard: {
    backgroundColor: '#1A1825',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#6C4CF122',
  },
  balanceLabel: {
    color: '#9B97B2',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 40,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#24223A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  address: {
    color: '#9B97B2',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#6C4CF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: '#9B97B2',
    fontSize: 13,
    fontWeight: '600',
  },
  chainTabs: {
    gap: 8,
    paddingHorizontal: 0,
    marginBottom: 16,
  },
  chainTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1A1825',
    borderWidth: 1,
    borderColor: '#24223A',
  },
  chainTabActive: {
    backgroundColor: '#6C4CF1',
    borderColor: '#6C4CF1',
  },
  chainTabText: {
    color: '#9B97B2',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyText: { color: '#4A4760', fontSize: 15 },
  tokenCard: {
    backgroundColor: '#1A1825',
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
  tokenName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  tokenSymbol: { color: '#9B97B2', fontSize: 13, marginTop: 2 },
  tokenBalance: { alignItems: 'flex-end' },
  tokenAmount: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  tokenUSD: { color: '#9B97B2', fontSize: 12, marginTop: 2 },
});
