import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import { useWallet, Blockchain, Token } from '../context/WalletContext';
import { fetchAssetHistory, getAssetExplorerUrl, WalletActivity } from '../mobile/services/transactionHistory';
import { getEvmRpcConfig, getSolanaRpcEndpoint } from '../mobile/services/rpcManager';

const SYMBOL: Record<Blockchain, string> = { ethereum: 'ETH', bnb: 'BNB', polygon: 'POL', solana: 'SOL' };
const NAMES: Record<Blockchain, string> = { ethereum: 'Ethereum', bnb: 'BNB Chain', polygon: 'Polygon', solana: 'Solana' };
const COLORS: Record<Blockchain, string> = { ethereum: '#627EEA', bnb: '#D9A514', polygon: '#8247E5', solana: '#9945FF' };

function ActivityRow({ item }: { item: WalletActivity }) {
  const icon = item.status === 'failed' ? 'close-circle-outline' : item.direction === 'in' ? 'arrow-down-left' : item.direction === 'out' ? 'arrow-up-right' : item.direction === 'contract' ? 'code-outline' : 'swap-horizontal-outline';
  const color = item.status === 'failed' ? '#D64545' : item.direction === 'in' ? '#15966A' : item.direction === 'out' ? '#6C4CF1' : '#777286';
  return (
    <TouchableOpacity style={s.activityRow} onPress={() => Linking.openURL(item.explorerUrl)} activeOpacity={0.7}>
      <View style={[s.activityIcon, { backgroundColor: color + '16' }]}><Ionicons name={icon as any} size={19} color={color} /></View>
      <View style={s.activityMain}>
        <Text style={s.activityTitle}>{item.title}</Text>
        <Text style={s.activitySub}>{item.subtitle}</Text>
        <Text style={s.activityTime}>{item.timestamp ? new Date(item.timestamp * 1000).toLocaleString() : 'Time unavailable'}</Text>
      </View>
      <View style={s.activityRight}>
        {item.amount ? <Text style={s.activityAmount}>{item.amount}</Text> : null}
        <Text style={[s.status, { color }]}>{item.status === 'failed' ? 'Failed' : item.status === 'pending' ? 'Pending' : 'Confirmed'}</Text>
        <Ionicons name="open-outline" size={13} color="#A29BAF" style={{ marginTop: 5 }} />
      </View>
    </TouchableOpacity>
  );
}

export default function AssetProfile() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { tokens, selectedBlockchain, network, walletAddresses, setSelectedBlockchain, isLocked } = useWallet();
  const asset = useMemo(() => tokens.find((token) => token.id === params.id), [tokens, params.id]);
  const assetWalletAddress = asset ? (walletAddresses?.[asset.blockchain] || '') : '';
  const [history, setHistory] = useState<WalletActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [displayBalance, setDisplayBalance] = useState<string | null>(null);

  useEffect(() => {
    if (asset && selectedBlockchain !== asset.blockchain) setSelectedBlockchain(asset.blockchain);
  }, [asset?.id, asset?.blockchain, selectedBlockchain, setSelectedBlockchain]);

  const loadHistory = async () => {
    if (!asset || isLocked) { setLoading(false); return; }
    setError('');
    try {
      if (asset.blockchain === 'solana') {
        const rpc = getSolanaRpcEndpoint(network);
        const method = async (name: string, params: unknown[]) => {
          const response = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: name, params }) });
          if (!response.ok) throw new Error('Unable to fetch live asset balance.');
          const json = await response.json();
          if (json.error) throw new Error(json.error.message || 'Unable to fetch live asset balance.');
          return json.result;
        };
        if (asset.contractAddress) {
          const accounts = await method('getTokenAccountsByOwner', [assetWalletAddress, { mint: asset.contractAddress }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
          const raw = (accounts?.value || []).reduce((sum: bigint, item: any) => sum + BigInt(item.account.data.parsed.info.tokenAmount.amount || '0'), 0n);
          setDisplayBalance(ethers.formatUnits(raw, asset.decimals ?? 0));
        } else {
          const result = await method('getBalance', [assetWalletAddress, { commitment: 'confirmed' }]);
          setDisplayBalance(ethers.formatUnits(BigInt(result.value), 9));
        }
      } else {
        const config = getEvmRpcConfig(asset.blockchain as 'ethereum' | 'bnb' | 'polygon', network);
        const provider = new ethers.JsonRpcProvider(config.rpc, config.chainId);
        const chain = await provider.getNetwork();
        if (Number(chain.chainId) !== config.chainId) throw new Error('RPC network mismatch while loading balance.');
        if (asset.contractAddress) {
          const contract = new ethers.Contract(asset.contractAddress, ['function balanceOf(address) view returns (uint256)'], provider);
          const raw = await contract.balanceOf(assetWalletAddress);
          setDisplayBalance(ethers.formatUnits(raw, asset.decimals ?? 18));
        } else {
          const raw = await provider.getBalance(assetWalletAddress);
          setDisplayBalance(ethers.formatEther(raw));
        }
      }
    } catch (e: any) {
      setDisplayBalance(null);
    }
    try {
      const rows = await fetchAssetHistory(asset.blockchain, network, assetWalletAddress, asset);
      setHistory(rows.slice(0, 50));
    } catch (e: any) {
      setError(e?.message || 'Unable to load transaction history.');
      setHistory([]);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { setLoading(true); void loadHistory(); }, [asset?.id, assetWalletAddress, network, isLocked]);

  if (!asset) return <SafeAreaView style={s.container}><View style={s.empty}><Text style={s.emptyTitle}>Asset unavailable</Text><TouchableOpacity onPress={() => router.back()}><Text style={s.link}>Go back</Text></TouchableOpacity></View></SafeAreaView>;

  const native = !asset.contractAddress;
  const explorer = getAssetExplorerUrl(asset.blockchain, network, assetWalletAddress, asset.contractAddress);
  const amount = displayBalance !== null ? Number(displayBalance).toLocaleString(undefined, { maximumFractionDigits: 8 }) : Number.isFinite(asset.balance) ? asset.balance.toLocaleString(undefined, { maximumFractionDigits: 8 }) : '0';

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}><Ionicons name="arrow-back" size={22} color="#211B35" /></TouchableOpacity>
        <Text style={s.headerTitle}>Asset details</Text>
        <TouchableOpacity onPress={() => Linking.openURL(explorer)} style={s.headerAction}><Ionicons name="open-outline" size={19} color="#6C4CF1" /></TouchableOpacity>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadHistory(); }} tintColor="#6C4CF1" />}>
        <View style={s.assetHero}>
          <Text style={s.assetType}>{native ? 'NATIVE TOKEN' : 'IMPORTED TOKEN'}</Text>
          <View style={[s.coinIcon, { backgroundColor: COLORS[asset.blockchain] + '18' }]}><Text style={[s.coinLetter, { color: COLORS[asset.blockchain] }]}>{asset.symbol.slice(0, 1)}</Text></View>
          <Text style={s.assetName}>{asset.name}</Text>
          <Text style={s.assetSymbol}>{asset.symbol} · {NAMES[asset.blockchain]} · {network.toUpperCase()}</Text>
          <Text style={s.balance}>{amount} <Text style={s.balanceSymbol}>{asset.symbol}</Text></Text>
          <Text style={s.usd}>${asset.balanceUSD.toFixed(2)}</Text>
          {asset.contractAddress ? <Text selectable style={s.contract}>{asset.contractAddress}</Text> : null}
        </View>

        <View style={s.historyHeader}>
          <View><Text style={s.sectionTitle}>Transaction history</Text><Text style={s.sectionSub}>Latest 50 transactions and interactions</Text></View>
          <TouchableOpacity onPress={() => { setRefreshing(true); void loadHistory(); }} style={s.refresh}><Ionicons name="refresh" size={17} color="#6C4CF1" /></TouchableOpacity>
        </View>

        <View style={s.historyPanel}>
          {loading ? <View style={s.state}><ActivityIndicator size="large" color="#6C4CF1" /><Text style={s.stateText}>Loading activity…</Text></View> :
            error ? <View style={s.state}><Ionicons name="cloud-offline-outline" size={30} color="#9A95A8" /><Text style={s.errorText}>{error}</Text><TouchableOpacity onPress={() => { setLoading(true); void loadHistory(); }}><Text style={s.link}>Try again</Text></TouchableOpacity><TouchableOpacity onPress={() => Linking.openURL(explorer)}><Text style={s.link}>Open block explorer</Text></TouchableOpacity></View> :
            history.length === 0 ? <View style={s.state}><Ionicons name="receipt-outline" size={32} color="#B1ABBE" /><Text style={s.stateText}>No transactions found for this asset.</Text></View> :
            history.map((item) => <ActivityRow key={item.id} item={item} />)}
        </View>
        <TouchableOpacity style={s.providerCredit} onPress={() => Linking.openURL(asset.blockchain === 'ethereum' ? 'https://routescan.io' : asset.blockchain === 'bnb' ? 'https://binplorer.com' : asset.blockchain === 'polygon' ? 'https://polygon.blockscout.com' : 'https://explorer.solana.com')}><Text style={s.providerCreditText}>Transaction data by {asset.blockchain === 'ethereum' ? 'Routescan' : asset.blockchain === 'bnb' ? 'Binplorer' : asset.blockchain === 'polygon' ? 'Blockscout' : 'Solana RPC'}</Text></TouchableOpacity>
        {!loading && history.length >= 50 ? <TouchableOpacity style={s.explorerMore} onPress={() => Linking.openURL(explorer)}><Text style={s.explorerText}>View explorer for more transactions</Text><Ionicons name="open-outline" size={16} color="#6C4CF1" /></TouchableOpacity> : null}
        <View style={{ height: 24 }} />
      </ScrollView>
      <View style={s.bottomActions}>
        <TouchableOpacity style={s.sendButton} onPress={() => {
          setSelectedBlockchain(asset.blockchain);
          if (asset.contractAddress) router.push({ pathname: '/send', params: { assetId: asset.id, assetChain: asset.blockchain, assetContract: asset.contractAddress, assetSymbol: asset.symbol, assetDecimals: String(asset.decimals ?? 18) } });
          else router.push({ pathname: '/send', params: { assetChain: asset.blockchain } });
        }}><Ionicons name="arrow-up" size={19} color="#FFFFFF" /><Text style={s.sendText}>Send {asset.symbol}</Text></TouchableOpacity>
        <TouchableOpacity style={s.receiveButton} onPress={() => { setSelectedBlockchain(asset.blockchain); router.push({ pathname: '/receive', params: { assetChain: asset.blockchain, assetSymbol: asset.symbol, assetName: asset.name, ...(asset.contractAddress ? { assetContract: asset.contractAddress } : {}) } }); }}><Ionicons name="arrow-down" size={19} color="#6C4CF1" /><Text style={s.receiveText}>Receive</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#EEEAF5' },
  back: { width: 40, height: 42, justifyContent: 'center' }, headerTitle: { color: '#211B35', fontSize: 17, fontWeight: '800' }, headerAction: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 }, content: { padding: 18, paddingBottom: 28 },
  assetHero: { alignItems: 'center', paddingVertical: 16, backgroundColor: '#FAF9FD', borderRadius: 22, borderWidth: 1, borderColor: '#EEEAF5' },
  assetType: { color: '#8A849B', fontSize: 10, letterSpacing: 1.7, fontWeight: '900', marginBottom: 15 },
  coinIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, coinLetter: { fontSize: 25, fontWeight: '900' },
  assetName: { color: '#211B35', fontSize: 19, fontWeight: '900', marginTop: 12 }, assetSymbol: { color: '#8A849B', fontSize: 11, marginTop: 4, fontWeight: '700' },
  balance: { color: '#211B35', fontSize: 30, fontWeight: '900', marginTop: 17 }, balanceSymbol: { color: '#777286', fontSize: 15 }, usd: { color: '#777286', fontSize: 13, marginTop: 4 },
  contract: { color: '#8A849B', fontSize: 10, marginTop: 12, paddingHorizontal: 18, textAlign: 'center' },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  sectionTitle: { color: '#211B35', fontSize: 17, fontWeight: '900' }, sectionSub: { color: '#928CA0', fontSize: 11, marginTop: 3 }, refresh: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F3F0FF', alignItems: 'center', justifyContent: 'center' },
  historyPanel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EEEAF5', borderRadius: 18, overflow: 'hidden' },
  activityRow: { minHeight: 83, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0EDF5', gap: 10 },
  activityIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, activityMain: { flex: 1 }, activityTitle: { color: '#211B35', fontSize: 13, fontWeight: '800' }, activitySub: { color: '#777286', fontSize: 10, marginTop: 3 }, activityTime: { color: '#A19BAB', fontSize: 9, marginTop: 4 },
  activityRight: { alignItems: 'flex-end', maxWidth: '35%' }, activityAmount: { color: '#211B35', fontSize: 11, fontWeight: '800' }, status: { fontSize: 9, fontWeight: '800', marginTop: 4 },
  state: { alignItems: 'center', justifyContent: 'center', padding: 30, gap: 10 }, stateText: { color: '#898397', fontSize: 12, textAlign: 'center' }, errorText: { color: '#B42318', fontSize: 12, textAlign: 'center' },
  providerCredit: { alignItems: 'center', paddingTop: 10 }, providerCreditText: { color: '#A29BAF', fontSize: 9, textDecorationLine: 'underline' },
  explorerMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }, explorerText: { color: '#6C4CF1', fontSize: 12, fontWeight: '800' },
  bottomActions: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 20, borderTopWidth: 1, borderTopColor: '#EEEAF5', backgroundColor: '#FFFFFF' },
  sendButton: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#6C4CF1', borderRadius: 14 }, sendText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  receiveButton: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F3F0FF', borderWidth: 1, borderColor: '#E8E1FF', borderRadius: 14 }, receiveText: { color: '#6C4CF1', fontSize: 13, fontWeight: '900' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: '#211B35', fontSize: 18, fontWeight: '800' }, link: { color: '#6C4CF1', fontSize: 12, fontWeight: '800', marginTop: 10 },
});
