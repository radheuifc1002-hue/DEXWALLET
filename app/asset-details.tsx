import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Blockchain, useWallet } from '../context/WalletContext';
import { fetchSolanaAssetHistory } from '../mobile/services/solanaHistory';
import { fetchEvmAssetHistory } from '../mobile/services/transactionHistory';

type HistoryRow = {
  id: string;
  hash: string;
  title: string;
  detail: string;
  amount: string;
  timestamp: number;
  incoming: boolean;
  failed: boolean;
  status?: 'success'|'failed'|'unknown';
  explorerUrl: string;
};

const CHAIN_LABELS: Record<Blockchain, string> = {
  ethereum: 'Ethereum',
  bnb: 'BNB Chain',
  polygon: 'Polygon',
  solana: 'Solana',
};
const CHAIN_SYMBOLS: Record<Blockchain, string> = {
  ethereum: 'ETH',
  bnb: 'BNB',
  polygon: 'POL',
  solana: 'SOL',
};
const EXPLORERS: Record<Blockchain, string> = {
  ethereum: 'https://etherscan.io/tx/',
  bnb: 'https://bscscan.com/tx/',
  polygon: 'https://polygonscan.com/tx/',
  solana: 'https://solscan.io/tx/',
};
const MAX_HISTORY = 50;

function transactionExplorerUrl(chain: Blockchain, network: string, hash: string) {
  if (chain === 'solana') return EXPLORERS.solana + hash + (network === 'testnet' ? '?cluster=devnet' : '');
  if (network === 'testnet') {
    const bases: Record<Blockchain, string> = {
      ethereum: 'https://sepolia.etherscan.io/tx/',
      bnb: 'https://testnet.bscscan.com/tx/',
      polygon: 'https://amoy.polygonscan.com/tx/',
      solana: EXPLORERS.solana,
    };
    return bases[chain] + hash;
  }
  return EXPLORERS[chain] + hash;
}

function shortAddress(value: string) {
  return value.length > 22 ? value.slice(0, 10) + '…' + value.slice(-8) : value;
}

export default function AssetDetails() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    assetId: string;
    name: string;
    symbol: string;
    blockchain: string;
    contractAddress?: string;
    decimals?: string;
    isNative?: string;
  }>();
  const { walletAddresses, network, setSelectedBlockchain } = useWallet();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [historyWarning, setHistoryWarning] = useState('');

  const chain = (['ethereum', 'bnb', 'polygon', 'solana'].includes(params.blockchain)
    ? params.blockchain
    : 'ethereum') as Blockchain;
  const name = String(params.name || 'Asset');
  const symbol = String(params.symbol || '');
  const contractAddress = String(params.contractAddress || '');
  const isNative = params.isNative === 'true' || !contractAddress;
  const decimals = Math.max(0, Math.min(36, Number(params.decimals || 18)));
  const walletAddress = walletAddresses?.[chain] || '';

  const copyContractAddress = async () => {
    if (!contractAddress) return;
    await Clipboard.setStringAsync(contractAddress);
    setCopied(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 1800);
  };

  const loadHistory = useCallback(async (append = false, cursor?: string | null) => {
    if (!walletAddress) {
      if (!append) setRows([]);
      setError('Wallet address is not available for this network.');
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
      return;
    }
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      let result: HistoryRow[] = [];
      let more = false;
      let next: string | null = null;
      let complete = true;
      let warning = '';
      if (chain === 'solana') {
        const history = await fetchSolanaAssetHistory({
          network: network === 'testnet' ? 'testnet' : 'mainnet',
          walletAddress,
          isNative,
          mintAddress: isNative ? undefined : contractAddress,
          before: append ? cursor || undefined : undefined,
          limit: MAX_HISTORY,
        });
        result = history.rows.map((row) => ({
          id: row.id, hash: row.hash, title: row.title, detail: row.detail,
          amount: row.amount, timestamp: row.timestamp, incoming: row.incoming,
          failed: row.failed, status: row.status, explorerUrl: row.explorerUrl,
        }));
        more = history.hasMore;
        next = history.nextBefore;
        complete = history.complete;
      } else {
        const history = await fetchEvmAssetHistory({
          chain,
          network,
          walletAddress,
          contractAddress,
          isNative,
          name,
          symbol,
          limit: MAX_HISTORY,
        });
        result = history.rows.map((row) => ({ ...row }));
        complete = history.complete;
        warning = history.warning || '';
      }
      const seen = new Set<string>();
      result = result.filter((item) => {
        if (!item.hash || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }).sort((a, b) => b.timestamp - a.timestamp);
      setRows((previous) => {
        const combined = append ? [...previous, ...result] : result;
        const unique = new Map<string, HistoryRow>();
        for (const item of combined) if (!unique.has(item.id)) unique.set(item.id, item);
        return [...unique.values()].sort((a, b) => b.timestamp - a.timestamp);
      });
      setHasMore(more);
      setNextBefore(next);
      setHistoryWarning(warning || (!complete && chain !== 'solana' ? 'Some transfers or transaction receipts could not be verified. Pull to refresh to retry.' : ''));
    } catch (e: any) {
      if (!append) setRows([]);
      setError(e?.message || 'Could not load this asset history. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [walletAddress, chain, network, isNative, contractAddress, name, symbol]);

  useEffect(() => {
    void loadHistory(false);
  }, [loadHistory]);

  const refresh = () => {
    setRefreshing(true);
    setNextBefore(null);
    setHasMore(false);
    void loadHistory(false);
  };

  const loadOlder = () => {
    if (!loadingMore && hasMore && nextBefore) void loadHistory(true, nextBefore);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color="#211B35" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{name}</Text>
          <Text style={styles.headerSubtitle}>{CHAIN_LABELS[chain]} · {symbol}</Text>
        </View>
        <TouchableOpacity onPress={refresh} style={styles.refreshButton} accessibilityRole="button" accessibilityLabel="Refresh asset history">
          <Ionicons name="refresh-outline" size={20} color="#6C4CF1" />
        </TouchableOpacity>
      </View>

      {!isNative && contractAddress ? (
        <View style={styles.contractCard}>
          <View style={styles.contractTextWrap}>
            <Text style={styles.contractLabel}>Contract address</Text>
            <Text selectable numberOfLines={1} style={styles.contractAddress}>{contractAddress}</Text>
          </View>
          <TouchableOpacity
            style={styles.copyButton}
            onPress={copyContractAddress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Copy token contract address"
          >
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={19} color={copied ? '#059669' : '#6C4CF1'} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.assetActions}>
        <TouchableOpacity style={styles.assetActionPrimary} onPress={() => {
          setSelectedBlockchain(chain);
          router.push({
            pathname: '/send',
            params: {
              assetId: String(params.assetId || ''),
              contractAddress,
            },
          });
        }}>
          <Ionicons name="arrow-up" size={17} color="#FFFFFF" />
          <Text style={styles.assetActionPrimaryText}>Send</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.assetActionSecondary} onPress={() => { setSelectedBlockchain(chain); router.push('/receive'); }}>
          <Ionicons name="arrow-down" size={17} color="#6C4CF1" />
          <Text style={styles.assetActionSecondaryText}>Receive</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#6C4CF1" />}
      >
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Transaction history</Text>
            <Text style={styles.sectionSubtitle}>Latest {MAX_HISTORY} {isNative ? symbol : name} transfers</Text>
          </View>
          <Text style={styles.count}>{rows.length}</Text>
        </View>
        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color="#6C4CF1" />
            <Text style={styles.stateTitle}>Loading history</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Ionicons name="cloud-offline-outline" size={30} color="#B42318" />
            <Text style={styles.stateTitle}>History unavailable</Text>
            <Text style={styles.stateMessage}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={refresh}><Text style={styles.retryText}>Try again</Text></TouchableOpacity>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.stateCard}>
            <Ionicons name="receipt-outline" size={30} color="#6C4CF1" />
            <Text style={styles.stateTitle}>No transactions yet</Text>
            <Text style={styles.stateMessage}>No activity was found for this asset on {CHAIN_LABELS[chain]} {network}.</Text>
          </View>
        ) : rows.map((row) => (
          <TouchableOpacity key={row.id} style={styles.row} activeOpacity={0.78} onPress={() => Linking.openURL(row.explorerUrl)}>
            <View style={[styles.directionIcon, row.failed && styles.failedIcon]}>
              <Ionicons name={row.failed ? 'close' : row.incoming ? 'arrow-down-left-box' : 'arrow-up-right-box'} size={19} color={row.failed ? '#B42318' : row.incoming ? '#059669' : '#6C4CF1'} />
            </View>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text numberOfLines={1} style={styles.rowDetail}>{row.detail}</Text>
              <Text style={styles.rowDate}>{row.timestamp ? new Date(row.timestamp * 1000).toLocaleString() : 'Time unavailable'}</Text>
            </View>
            <View style={styles.rowRight}>
              {row.amount ? <Text numberOfLines={1} style={styles.amount}>{row.amount}</Text> : null}
              <Text style={[styles.status, (row.status === 'unknown' || (!row.status && !row.failed)) && styles.statusUnknown, row.failed && styles.statusFailed]}>{row.status === 'unknown' ? 'Unverified' : row.failed ? 'Failed' : 'Confirmed'}</Text>
              <Ionicons name="open-outline" size={13} color="#9A95A8" style={{ marginTop: 5 }} />
            </View>
          </TouchableOpacity>
        ))}
        {historyWarning ? <Text style={styles.warningNote}>{historyWarning}</Text> : null}
        {hasMore && !loading ? (
          <TouchableOpacity style={styles.loadMoreButton} onPress={loadOlder} disabled={loadingMore}>
            {loadingMore ? <ActivityIndicator color="#6C4CF1" /> : <Text style={styles.loadMoreText}>Load older transactions</Text>}
          </TouchableOpacity>
        ) : null}
        <Text style={styles.footerNote}>Tap a transaction to open its block explorer record.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FC' },
  header: { minHeight: 66, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#ECE8F4', backgroundColor: '#FFFFFF' },
  backButton: { width: 40, height: 42, justifyContent: 'center' },
  headerText: { flex: 1, paddingLeft: 5 },
  headerTitle: { color: '#211B35', fontSize: 18, fontWeight: '900' },
  headerSubtitle: { color: '#777286', fontSize: 11, marginTop: 3, fontWeight: '700' },
  refreshButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#F3F0FF', alignItems: 'center', justifyContent: 'center' },
  contractCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 18, marginTop: 15, paddingVertical: 11, paddingLeft: 13, paddingRight: 7, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECE8F4' },
  contractTextWrap: { flex: 1, minWidth: 0 },
  contractLabel: { color: '#8A849B', fontSize: 10, fontWeight: '700', marginBottom: 5 },
  contractAddress: { color: '#211B35', fontSize: 11, fontFamily: 'monospace' },
  copyButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  content: { padding: 18, paddingBottom: 36 },
  assetActions: { flexDirection: 'row', gap: 10, marginHorizontal: 18, marginTop: 14 },
  assetActionPrimary: { flex: 1, minHeight: 46, borderRadius: 13, backgroundColor: '#6C4CF1', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  assetActionPrimaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  assetActionSecondary: { flex: 1, minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: '#DCD5F4', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  assetActionSecondaryText: { color: '#6C4CF1', fontSize: 13, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { color: '#211B35', fontSize: 18, fontWeight: '900' },
  sectionSubtitle: { color: '#8A849B', fontSize: 11, marginTop: 4 },
  count: { minWidth: 32, textAlign: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, overflow: 'hidden', backgroundColor: '#EEE9FF', color: '#6C4CF1', fontSize: 12, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 13, marginBottom: 9, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECE8F4' },
  directionIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F1EDFF', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  failedIcon: { backgroundColor: '#FFF1F0' },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { color: '#211B35', fontSize: 13, fontWeight: '800' },
  rowDetail: { color: '#777286', fontSize: 10, marginTop: 4 },
  rowDate: { color: '#A09AAC', fontSize: 9, marginTop: 5 },
  rowRight: { alignItems: 'flex-end', marginLeft: 8, maxWidth: '38%' },
  amount: { color: '#211B35', fontSize: 10, fontWeight: '800', marginBottom: 4 },
  status: { color: '#059669', fontSize: 9, fontWeight: '800' },
  statusFailed: { color: '#B42318' },
  statusUnknown: { color: '#9A6700' },
  warningNote: { color: '#9A6700', backgroundColor: '#FFF7E6', borderRadius: 10, padding: 11, fontSize: 10, lineHeight: 15, marginTop: 10 },
  loadMoreButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1EDFF', borderRadius: 12, marginTop: 8 },
  loadMoreText: { color: '#6C4CF1', fontSize: 12, fontWeight: '800' },
  stateCard: { minHeight: 220, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECE8F4', alignItems: 'center', justifyContent: 'center', padding: 24, marginTop: 8 },
  stateTitle: { color: '#211B35', fontSize: 15, fontWeight: '900', marginTop: 12, marginBottom: 7 },
  stateMessage: { color: '#8A849B', fontSize: 11, textAlign: 'center', lineHeight: 17 },
  retryButton: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#6C4CF1', borderRadius: 12, marginTop: 16 },
  retryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  footerNote: { color: '#A09AAC', fontSize: 10, textAlign: 'center', marginTop: 14 },
});
