import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useWallet, Blockchain } from '../context/WalletContext';
import { getEvmRpcConfig, getSolanaRpcEndpoint } from '../mobile/services/rpcManager';

type HistoryItem = {
  id: string;
  hash: string;
  title: string;
  subtitle: string;
  amount: string;
  timestamp: number;
  status: 'Confirmed' | 'Failed';
  incoming: boolean;
  explorerUrl: string;
};

const PAGE_SIZE = 50;

const CHAIN_NAMES: Record<Blockchain, string> = {
  ethereum: 'Ethereum',
  bnb: 'BNB Chain',
  polygon: 'Polygon',
  solana: 'Solana',
};

const NATIVE_SYMBOLS: Record<Blockchain, string> = {
  ethereum: 'ETH',
  bnb: 'BNB',
  polygon: 'POL',
  solana: 'SOL',
};

const ADDRESS_EXPLORERS: Record<Blockchain, { mainnet: string; testnet: string }> = {
  ethereum: { mainnet: 'https://etherscan.io/address/', testnet: 'https://sepolia.etherscan.io/address/' },
  bnb: { mainnet: 'https://bscscan.com/address/', testnet: 'https://testnet.bscscan.com/address/' },
  polygon: { mainnet: 'https://polygonscan.com/address/', testnet: 'https://amoy.polygonscan.com/address/' },
  solana: { mainnet: 'https://solscan.io/account/', testnet: 'https://solscan.io/account/' },
};

const EXPLORERS: Record<Blockchain, { mainnet: string; testnet: string }> = {
  ethereum: { mainnet: 'https://etherscan.io/tx/', testnet: 'https://sepolia.etherscan.io/tx/' },
  bnb: { mainnet: 'https://bscscan.com/tx/', testnet: 'https://testnet.bscscan.com/tx/' },
  polygon: { mainnet: 'https://polygonscan.com/tx/', testnet: 'https://amoy.polygonscan.com/tx/' },
  solana: { mainnet: 'https://solscan.io/tx/', testnet: 'https://solscan.io/tx/' },
};

function shorten(value: string) {
  if (!value) return 'Unknown address';
  return value.length > 18 ? value.slice(0, 9) + '…' + value.slice(-7) : value;
}

function formatAmount(raw: string, decimals: number) {
  const value = Number(raw) / Math.pow(10, decimals);
  if (!Number.isFinite(value)) return '';
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

async function fetchExplorerRows(url: string): Promise<any[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error('Explorer returned HTTP ' + response.status + '.');
    const json = await response.json();
    if (json.status === '0') {
      const detail = String(json.result || json.message || '');
      if (/no transactions found/i.test(detail)) return [];
      throw new Error(detail || 'The transaction explorer could not return history.');
    }
    return Array.isArray(json.result) ? json.result : [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBinplorer(url: string): Promise<any> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('BNB history service returned HTTP ' + response.status + '.');
  const json = await response.json();
  if (json?.error) throw new Error(json.error.message || 'BNB transaction history is unavailable.');
  return json;
}

async function fetchBlockscoutList(url: string): Promise<any> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Polygon history service returned HTTP ' + response.status + '.');
  return response.json();
}

function cursorQuery(cursor: any): string {
  if (!cursor || typeof cursor !== 'object') return '';
  const entries = Object.entries(cursor).filter((entry) => entry[1] !== null && entry[1] !== undefined);
  return entries.length ? '?' + entries.map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(String(value))).join('&') : '';
}

async function fetchSolanaSignatures(address: string, network: 'mainnet' | 'testnet', before?: string) {
  const endpoint = getSolanaRpcEndpoint(network);
  const config: any = { limit: PAGE_SIZE, commitment: 'confirmed' };
  if (before) config.before = before;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params: [address, config] }),
  });
  if (!response.ok) throw new Error('Solana RPC returned HTTP ' + response.status + '.');
  const json = await response.json();
  if (json.error) throw new Error(json.error.message || 'Unable to load Solana history.');
  return Array.isArray(json.result) ? json.result : [];
}

export default function TransactionHistory() {
  const router = useRouter();
  const { selectedBlockchain, network, walletAddress } = useWallet();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [beforeSignature, setBeforeSignature] = useState('');
  const [polygonTxCursor, setPolygonTxCursor] = useState<any>(null);
  const [polygonTransferCursor, setPolygonTransferCursor] = useState<any>(null);

  const loadHistory = useCallback(async (reset: boolean) => {
    if (!walletAddress) {
      setItems([]);
      setLoading(false);
      setError('Wallet address is not available.');
      return;
    }
    if (reset) {
      setLoading(true);
      setError('');
      setPage(1);
      setBeforeSignature('');
      setPolygonTxCursor(null);
      setPolygonTransferCursor(null);
    } else {
      setLoadingMore(true);
    }

    try {
      let nextItems: HistoryItem[] = [];
      let more = false;

      if (selectedBlockchain === 'solana') {
        const before = reset ? undefined : beforeSignature || undefined;
        const signatures = await fetchSolanaSignatures(walletAddress, network, before);
        nextItems = signatures.map((entry: any) => ({
          id: String(entry.signature),
          hash: String(entry.signature),
          title: entry.err ? 'Failed transaction' : 'Solana transaction',
          subtitle: entry.memo ? String(entry.memo) : 'Signature ' + shorten(String(entry.signature)),
          amount: '',
          timestamp: Number(entry.blockTime || 0),
          status: entry.err ? 'Failed' : 'Confirmed',
          incoming: false,
          explorerUrl: EXPLORERS.solana[network] + String(entry.signature) + (network === 'testnet' ? '?cluster=devnet' : ''),
        }));
        more = signatures.length === PAGE_SIZE;
        if (signatures.length) setBeforeSignature(String(signatures[signatures.length - 1].signature));
      } else if (selectedBlockchain === 'bnb') {
        if (network !== 'mainnet') {
          throw new Error('A public keyless transaction indexer is not currently available for BNB testnet. You can still open the BNB testnet explorer from a transaction hash.');
        }
        const base = 'https://api.binplorer.com/';
        const addressPath = encodeURIComponent(walletAddress);
        const results = await Promise.all([
          fetchBinplorer(base + 'getAddressTransactions/' + addressPath + '?apiKey=freekey&limit=100'),
          fetchBinplorer(base + 'getAddressHistory/' + addressPath + '?apiKey=freekey&limit=100'),
        ]);
        const nativeRows = Array.isArray(results[0]) ? results[0] : [];
        const tokenRows = Array.isArray(results[1]?.operations) ? results[1].operations : [];
        const explorerBase = EXPLORERS.bnb.mainnet;
        const nativeItems: HistoryItem[] = nativeRows.map((row: any) => {
          const from = String(row.from || '');
          const to = String(row.to || '');
          const incoming = from.toLowerCase() !== walletAddress.toLowerCase();
          const hash = String(row.hash || '');
          const amount = row.value === undefined ? '' : Number(row.value).toLocaleString(undefined, { maximumFractionDigits: 6 }) + ' BNB';
          return {
            id: hash + ':native',
            hash,
            title: (incoming ? 'Received ' : 'Sent ') + 'BNB',
            subtitle: incoming ? 'From ' + shorten(from) : 'To ' + shorten(to),
            amount,
            timestamp: Number(row.timestamp || 0),
            status: row.success === false ? 'Failed' : 'Confirmed',
            incoming,
            explorerUrl: explorerBase + hash,
          };
        });
        const tokenItems: HistoryItem[] = tokenRows.map((row: any, index: number) => {
          const from = String(row.from || '');
          const to = String(row.to || '');
          const incoming = from.toLowerCase() !== walletAddress.toLowerCase();
          const hash = String(row.transactionHash || '');
          const symbol = String(row.tokenInfo?.symbol || 'TOKEN');
          const amount = row.value === undefined ? '' : Number(row.value).toLocaleString(undefined, { maximumFractionDigits: 6 }) + ' ' + symbol;
          return {
            id: hash + ':token:' + String(row.timestamp || index),
            hash,
            title: (incoming ? 'Received ' : 'Sent ') + symbol,
            subtitle: String(row.tokenInfo?.name || symbol) + ' · ' + (incoming ? 'From ' + shorten(from) : 'To ' + shorten(to)),
            amount,
            timestamp: Number(row.timestamp || 0),
            status: 'Confirmed',
            incoming,
            explorerUrl: explorerBase + hash,
          };
        });
        nextItems = nativeItems.concat(tokenItems).sort((a, b) => b.timestamp - a.timestamp);
        more = false;
      } else if (selectedBlockchain === 'polygon') {
        if (network !== 'mainnet') {
          throw new Error('Polygon Amoy history is not available from the current public keyless indexer. Mainnet history is supported.');
        }
        const base = 'https://polygon.blockscout.com/api/v2/addresses/' + encodeURIComponent(walletAddress);
        const txCursor = reset ? null : polygonTxCursor;
        const transferCursor = reset ? null : polygonTransferCursor;
        const txResult = txCursor ? await fetchBlockscoutList(base + '/transactions' + cursorQuery(txCursor)) : (reset ? await fetchBlockscoutList(base + '/transactions') : { items: [], next_page_params: null });
        const transferResult = transferCursor ? await fetchBlockscoutList(base + '/token-transfers' + cursorQuery(transferCursor)) : (reset ? await fetchBlockscoutList(base + '/token-transfers') : { items: [], next_page_params: null });
        const txRows = Array.isArray(txResult.items) ? txResult.items : [];
        const transferRows = Array.isArray(transferResult.items) ? transferResult.items : [];
        const nativeItems: HistoryItem[] = txRows.map((row: any) => {
          const from = String(row.from?.hash || '');
          const to = String(row.to?.hash || '');
          const incoming = from.toLowerCase() !== walletAddress.toLowerCase();
          const hash = String(row.hash || '');
          const timestamp = Math.floor(new Date(row.timestamp || 0).getTime() / 1000);
          const amount = formatAmount(String(row.value || '0'), 18);
          const failed = String(row.status || '').toLowerCase() === 'error' || String(row.result || '').toLowerCase().includes('fail');
          return {
            id: hash + ':native',
            hash,
            title: (incoming ? 'Received ' : 'Sent ') + 'POL',
            subtitle: incoming ? 'From ' + shorten(from) : 'To ' + shorten(to),
            amount: amount ? amount + ' POL' : '',
            timestamp,
            status: failed ? 'Failed' : 'Confirmed',
            incoming,
            explorerUrl: EXPLORERS.polygon.mainnet + hash,
          };
        });
        const tokenItems: HistoryItem[] = transferRows.map((row: any, index: number) => {
          const from = String(row.from?.hash || '');
          const to = String(row.to?.hash || '');
          const incoming = from.toLowerCase() !== walletAddress.toLowerCase();
          const hash = String(row.transaction_hash || row.tx_hash || '');
          const symbol = String(row.token?.symbol || 'TOKEN');
          const decimals = Number(row.token?.decimals || 18);
          const raw = String(row.total?.value || row.total_value || '0');
          const amount = formatAmount(raw, Number.isFinite(decimals) ? decimals : 18);
          const timestamp = Math.floor(new Date(row.timestamp || 0).getTime() / 1000);
          return {
            id: hash + ':token:' + String(row.log_index || index),
            hash,
            title: (incoming ? 'Received ' : 'Sent ') + symbol,
            subtitle: String(row.token?.name || symbol) + ' · ' + (incoming ? 'From ' + shorten(from) : 'To ' + shorten(to)),
            amount: amount ? amount + ' ' + symbol : '',
            timestamp,
            status: 'Confirmed',
            incoming,
            explorerUrl: EXPLORERS.polygon.mainnet + hash,
          };
        });
        nextItems = nativeItems.concat(tokenItems).sort((a, b) => b.timestamp - a.timestamp);
        setPolygonTxCursor(txResult.next_page_params || null);
        setPolygonTransferCursor(transferResult.next_page_params || null);
        more = Boolean(txResult.next_page_params || transferResult.next_page_params);
      } else {
        const rpcConfig = getEvmRpcConfig(selectedBlockchain, network);
        const networkName = network === 'mainnet' ? 'mainnet' : 'testnet';
        const base = 'https://api.routescan.io/v2/network/' + networkName + '/evm/' + rpcConfig.chainId + '/etherscan/api';
        const address = encodeURIComponent(walletAddress);
        const pageNumber = reset ? 1 : page + 1;
        const common = '&address=' + address + '&startblock=0&endblock=99999999&page=' + pageNumber + '&offset=' + PAGE_SIZE + '&sort=desc';
        const results = await Promise.all([
          fetchExplorerRows(base + '?module=account&action=txlist' + common),
          fetchExplorerRows(base + '?module=account&action=tokentx' + common),
        ]);
        const normalRows = results[0];
        const tokenRows = results[1];
        const nativeSymbol = NATIVE_SYMBOLS[selectedBlockchain];
        const explorerBase = EXPLORERS[selectedBlockchain][network];

        const mapRow = (row: any, tokenTransfer: boolean): HistoryItem => {
          const from = String(row.from || '');
          const to = String(row.to || '');
          const incoming = from.toLowerCase() !== walletAddress.toLowerCase();
          const symbol = tokenTransfer ? String(row.tokenSymbol || 'TOKEN') : nativeSymbol;
          const rawValue = String(row.value || '0');
          const decimals = tokenTransfer ? Number(row.tokenDecimal || 18) : 18;
          const amount = formatAmount(rawValue, Number.isFinite(decimals) ? decimals : 18);
          const hash = String(row.hash || row.transactionHash || '');
          const suffix = tokenTransfer ? String(row.logIndex || row.transactionIndex || 'token') : 'native';
          const failed = String(row.isError || '0') === '1' || String(row.txreceipt_status || '1') === '0';
          return {
            id: hash + ':' + suffix,
            hash,
            title: (incoming ? 'Received ' : 'Sent ') + symbol,
            subtitle: tokenTransfer
              ? String(row.tokenName || symbol) + ' · ' + (incoming ? 'From ' + shorten(from) : 'To ' + shorten(to))
              : (incoming ? 'From ' + shorten(from) : 'To ' + shorten(to)),
            amount: amount ? amount + ' ' + symbol : '',
            timestamp: Number(row.timeStamp || 0),
            status: failed ? 'Failed' : 'Confirmed',
            incoming,
            explorerUrl: explorerBase + hash,
          };
        };

        nextItems = normalRows.map((row: any) => mapRow(row, false))
          .concat(tokenRows.map((row: any) => mapRow(row, true)))
          .sort((a, b) => b.timestamp - a.timestamp);
        more = normalRows.length === PAGE_SIZE || tokenRows.length === PAGE_SIZE;
        setPage(pageNumber);
      }

      setItems((current) => {
        if (reset) return nextItems;
        const seen = new Set(current.map((item) => item.id));
        return current.concat(nextItems.filter((item) => !seen.has(item.id)));
      });
      setHasMore(more);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Could not load transaction history. Please try again.');
      if (reset) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [walletAddress, selectedBlockchain, network, beforeSignature, page, polygonTxCursor, polygonTransferCursor]);

  useEffect(() => {
    void loadHistory(true);
  }, [selectedBlockchain, network, walletAddress]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadHistory(true);
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) void loadHistory(false);
  };

  const openAddressExplorer = () => {
    const url = ADDRESS_EXPLORERS[selectedBlockchain][network] + walletAddress + (selectedBlockchain === 'solana' && network === 'testnet' ? '?cluster=devnet' : '');
    void Linking.openURL(url);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color="#211B35" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Transaction history</Text>
          <Text style={styles.headerSubtitle}>{CHAIN_NAMES[selectedBlockchain]} · {network.toUpperCase()}</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh} accessibilityRole="button" accessibilityLabel="Refresh transaction history">
          <Ionicons name="refresh-outline" size={20} color="#6C4CF1" />
        </TouchableOpacity>
      </View>

      <View style={styles.walletCard}>
        <View style={styles.walletIcon}><Ionicons name="wallet-outline" size={19} color="#6C4CF1" /></View>
        <View style={styles.walletText}>
          <Text style={styles.walletLabel}>Wallet address</Text>
          <Text numberOfLines={1} style={styles.walletAddress}>{walletAddress}</Text>
        </View>
        <View style={styles.liveDot} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6C4CF1" />}
      >
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>On-chain activity</Text>
            <Text style={styles.sectionSubtitle}>Recent transactions for this network</Text>
          </View>
          <View style={styles.countPill}><Text style={styles.countText}>{items.length}</Text></View>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color="#6C4CF1" />
            <Text style={styles.stateTitle}>Loading transactions</Text>
            <Text style={styles.stateMessage}>Fetching activity directly from the selected network's public explorer.</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <View style={styles.stateIconError}><Ionicons name="cloud-offline-outline" size={25} color="#B42318" /></View>
            <Text style={styles.stateTitle}>History unavailable</Text>
            <Text style={styles.stateMessage}>{error}</Text>
            <View style={styles.errorActions}>
              <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}><Text style={styles.retryText}>Try again</Text></TouchableOpacity>
              <TouchableOpacity style={styles.explorerButton} onPress={openAddressExplorer}><Ionicons name="open-outline" size={14} color="#6C4CF1" /><Text style={styles.explorerButtonText}>Open block explorer</Text></TouchableOpacity>
            </View>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.stateCard}>
            <View style={styles.stateIcon}><Ionicons name="receipt-outline" size={26} color="#6C4CF1" /></View>
            <Text style={styles.stateTitle}>No transactions yet</Text>
            <Text style={styles.stateMessage}>No on-chain activity was found for this address on {CHAIN_NAMES[selectedBlockchain]} {network}.</Text>
          </View>
        ) : (
          items.map((item) => (
            <TouchableOpacity key={item.id} style={styles.transactionCard} activeOpacity={0.78} onPress={() => Linking.openURL(item.explorerUrl)}>
              <View style={[styles.directionIcon, item.status === 'Failed' && styles.failedIcon]}>
                <Ionicons name={item.status === 'Failed' ? 'close' : item.incoming ? 'arrow-down-left' : 'arrow-up-right'} size={20} color={item.status === 'Failed' ? '#B42318' : item.incoming ? '#059669' : '#6C4CF1'} />
              </View>
              <View style={styles.transactionInfo}>
                <Text style={styles.transactionTitle}>{item.title}</Text>
                <Text numberOfLines={1} style={styles.transactionSubtitle}>{item.subtitle}</Text>
                <Text style={styles.transactionDate}>{item.timestamp ? new Date(item.timestamp * 1000).toLocaleString() : 'Time unavailable'}</Text>
              </View>
              <View style={styles.transactionRight}>
                {item.amount ? <Text numberOfLines={1} style={styles.amount}>{item.incoming ? '+' : '−'}{item.amount}</Text> : null}
                <Text style={[styles.status, item.status === 'Failed' && styles.statusFailed]}>{item.status}</Text>
                <Ionicons name="open-outline" size={13} color="#9A95A8" style={{ marginTop: 5 }} />
              </View>
            </TouchableOpacity>
          ))
        )}

        {!loading && !error && hasMore ? (
          <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="chevron-down" size={17} color="#FFFFFF" />}
            <Text style={styles.loadMoreText}>{loadingMore ? 'Loading…' : 'Load older transactions'}</Text>
          </TouchableOpacity>
        ) : null}
        {!loading && !error && items.length > 0 ? <Text style={styles.footerNote}>{selectedBlockchain === 'bnb' ? 'BNB history uses Binplorer’s free public index and is limited to the latest 30 days / 100 records.' : 'Tap any transaction to open its block explorer record.'}</Text> : null}
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
  walletCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 18, marginTop: 16, padding: 13, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECE8F4' },
  walletIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F3F0FF', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  walletText: { flex: 1 },
  walletLabel: { color: '#8A849B', fontSize: 10, fontWeight: '700', marginBottom: 4 },
  walletAddress: { color: '#211B35', fontSize: 11, fontFamily: 'monospace' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', marginLeft: 10 },
  content: { padding: 18, paddingBottom: 36 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { color: '#211B35', fontSize: 18, fontWeight: '900' },
  sectionSubtitle: { color: '#8A849B', fontSize: 11, marginTop: 4 },
  countPill: { minWidth: 32, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: '#EEE9FF', alignItems: 'center' },
  countText: { color: '#6C4CF1', fontSize: 12, fontWeight: '900' },
  transactionCard: { flexDirection: 'row', alignItems: 'center', padding: 13, marginBottom: 9, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECE8F4' },
  directionIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F1EDFF', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  failedIcon: { backgroundColor: '#FFF1F0' },
  transactionInfo: { flex: 1, minWidth: 0 },
  transactionTitle: { color: '#211B35', fontSize: 13, fontWeight: '800' },
  transactionSubtitle: { color: '#777286', fontSize: 10, marginTop: 4 },
  transactionDate: { color: '#A09AAC', fontSize: 9, marginTop: 5 },
  transactionRight: { alignItems: 'flex-end', marginLeft: 8, maxWidth: '38%' },
  amount: { color: '#211B35', fontSize: 10, fontWeight: '800', marginBottom: 4 },
  status: { color: '#059669', fontSize: 9, fontWeight: '800' },
  statusFailed: { color: '#B42318' },
  stateCard: { minHeight: 230, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECE8F4', alignItems: 'center', justifyContent: 'center', padding: 24, marginTop: 8 },
  stateIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#F3F0FF', alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  stateIconError: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#FFF1F0', alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  stateTitle: { color: '#211B35', fontSize: 15, fontWeight: '900', marginBottom: 7 },
  stateMessage: { color: '#8A849B', fontSize: 11, textAlign: 'center', lineHeight: 17 },
  retryButton: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#6C4CF1', borderRadius: 12, marginTop: 16 },
  retryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  errorActions: { alignItems: 'center', gap: 10, marginTop: 16 },
  explorerButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 11, borderWidth: 1, borderColor: '#DDD6F7', backgroundColor: '#F8F6FF' },
  explorerButtonText: { color: '#6C4CF1', fontSize: 11, fontWeight: '800' },
  loadMoreButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, backgroundColor: '#6C4CF1', marginTop: 12 },
  loadMoreText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  footerNote: { color: '#A09AAC', fontSize: 10, textAlign: 'center', marginTop: 14 },
});
