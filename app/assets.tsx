import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWallet, type Blockchain, type Token } from '../context/WalletContext';
import { refreshWalletTokenBalances } from '../mobile/services/balanceService';

const COLORS: Record<Blockchain,string> = { ethereum:'#627EEA', bnb:'#F3BA2F', polygon:'#8247E5', arbitrum:'#28A0F0', solana:'#9945FF', bitcoin:'#F7931A', tron:'#EF0027' };
const LABELS: Record<Blockchain,string> = { ethereum:'Ethereum', bnb:'BNB Chain', polygon:'Polygon', arbitrum:'Arbitrum', solana:'Solana', bitcoin:'Bitcoin', tron:'TRON' };
const CHAIN_ICONS: Record<Blockchain, string> = { ethereum:'logo-ethereum', bnb:'logo-bitcoin', polygon:'triangle-outline', arbitrum:'layers-outline', solana:'planet-outline', bitcoin:'logo-bitcoin', tron:'flash-outline' };
type PortfolioScope = 'wallet' | 'all';
function addressFor(account: { addresses: Partial<Record<Blockchain,string>> }, chain: Blockchain) { return account.addresses[chain] || ''; }

export default function AssetsScreen() {
  const router = useRouter();
  const { tokens, selectedBlockchain, activeWallet, activeVault, isLoadingBalances, refreshBalances, walletVaultStore, network } = useWallet();
  const [scope, setScope] = useState<PortfolioScope>('wallet');
  const [aggregate, setAggregate] = useState<Record<string, { balance: number; balanceUSD: number }>>({});
  const [aggregateLoading, setAggregateLoading] = useState(false);
  const [aggregateError, setAggregateError] = useState('');
  const visible = useMemo(() => tokens.filter((token) => token.blockchain === selectedBlockchain), [tokens, selectedBlockchain]);
  const tokenSignature = visible.map((token) => token.id).join('|');
  useEffect(() => {
    if (scope !== 'all') return;
    let cancelled = false;
    const load = async () => {
      setAggregateLoading(true); setAggregateError('');
      const totals: Record<string, { balance: number; balanceUSD: number }> = {};
      const seenAddresses = new Set<string>(); let hadErrors = false;
      const accounts = walletVaultStore?.vaults.flatMap((vault) => vault.accounts) ?? [];
      const chainTokens = tokens.filter((token) => token.blockchain === selectedBlockchain);
      for (const account of accounts) {
        const address = addressFor(account, selectedBlockchain); if (!address) continue;
        const key = selectedBlockchain === 'solana' ? address : address.toLowerCase();
        if (seenAddresses.has(key)) continue; seenAddresses.add(key);
        const addresses: Record<Blockchain, string> = { ethereum:'', bnb:'', polygon:'', arbitrum:'', solana:'', bitcoin:'', tron:'' }; addresses[selectedBlockchain] = address;
        try {
          const refreshed = await refreshWalletTokenBalances(addresses, chainTokens, network);
          for (const token of refreshed) {
            const current = totals[token.id] ?? { balance: 0, balanceUSD: 0 };
            totals[token.id] = { balance: current.balance + (Number.isFinite(token.balance) ? token.balance : 0), balanceUSD: current.balanceUSD + (!token.contractAddress ? (token.balanceUSD || 0) : 0) };
          }
        } catch { hadErrors = true; }
      }
      if (!cancelled) { setAggregate(totals); if (hadErrors) setAggregateError('Some wallet balances could not be refreshed. Displayed totals may be incomplete.'); setAggregateLoading(false); }
    };
    void load(); return () => { cancelled = true; };
  }, [scope, selectedBlockchain, network, walletVaultStore, tokenSignature]);
  const displayTokens: Token[] = scope === 'all' ? visible.map((token) => ({ ...token, balance: aggregate[token.id]?.balance ?? 0, balanceUSD: aggregate[token.id]?.balanceUSD ?? 0 })) : visible;
  const total = displayTokens.reduce((sum, token) => sum + (!token.contractAddress ? (token.balanceUSD || 0) : 0), 0);
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={22} color="#211B35" /></TouchableOpacity>
          <View style={{flex:1}}><Text style={styles.title}>Assets</Text><Text style={styles.subtitle}>{LABELS[selectedBlockchain]} · {scope === 'all' ? 'All wallets' : (activeWallet?.name || 'Wallet')}</Text></View>
          <TouchableOpacity onPress={() => scope === 'all' ? setScope('wallet') : refreshBalances()} style={styles.refresh}><Ionicons name={scope === 'all' ? 'person-outline' : 'refresh'} size={18} color="#6C4CF1" /></TouchableOpacity>
        </View>
        <View style={styles.scopeSwitch}>
          <TouchableOpacity style={[styles.scopeOption, scope === 'wallet' && styles.scopeOptionActive]} onPress={() => setScope('wallet')}><Ionicons name="wallet-outline" size={15} color={scope === 'wallet' ? '#6C4CF1' : '#8A849B'} /><Text style={[styles.scopeText, scope === 'wallet' && styles.scopeTextActive]}>This wallet</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.scopeOption, scope === 'all' && styles.scopeOptionActive]} onPress={() => setScope('all')}><Ionicons name="layers-outline" size={15} color={scope === 'all' ? '#6C4CF1' : '#8A849B'} /><Text style={[styles.scopeText, scope === 'all' && styles.scopeTextActive]}>All wallets</Text></TouchableOpacity>
        </View>
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>{scope === 'all' ? 'Combined native-coin value' : 'Native-coin value'}</Text>
          <Text style={styles.summaryValue}>${total.toFixed(2)}</Text>
          <Text style={styles.summaryHint}>{scope === 'all' ? 'Across unique addresses in your vaults' : (activeVault?.name || 'Active vault')}</Text>
          {scope === 'all' && aggregateLoading ? <View style={styles.loadingRow}><ActivityIndicator size="small" color="#6C4CF1" /><Text style={styles.loading}>Refreshing wallet balances…</Text></View> : null}
        </View>
        <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>Assets on {LABELS[selectedBlockchain]}</Text><Text style={styles.sectionSubtitle}>{scope === 'all' ? 'Combined balances across your wallets' : 'Only assets on the selected network'}</Text></View><Text style={styles.count}>{displayTokens.length} assets</Text></View>
        {aggregateError && scope === 'all' ? <Text style={styles.error}>{aggregateError}</Text> : null}
        {displayTokens.length === 0 ? <View style={styles.empty}><Ionicons name="cube-outline" size={38} color="#9B97A8" /><Text style={styles.emptyTitle}>No assets found</Text><Text style={styles.emptySub}>Import a token on {LABELS[selectedBlockchain]} to see it here.</Text><TouchableOpacity style={styles.import} onPress={() => router.push('/import-token')}><Text style={styles.importText}>Import token</Text></TouchableOpacity></View> : displayTokens.map((token) => (
          <TouchableOpacity key={token.id} style={styles.token} activeOpacity={0.8} disabled={scope === 'all'} onPress={() => router.push({ pathname:'/asset-details', params:{ assetId:token.id, name:token.name, symbol:token.symbol, blockchain:token.blockchain, contractAddress:token.contractAddress||'', decimals:String(token.decimals??18), isNative:token.contractAddress?'false':'true' } })}>
            <View style={[styles.icon,{backgroundColor:(COLORS[token.blockchain]||'#6C4CF1')+'20'}]}>{token.logo ? <Image source={{uri:token.logo}} style={styles.logo} /> : <Ionicons name={CHAIN_ICONS[token.blockchain] as any} size={22} color={COLORS[token.blockchain]} />}</View>
            <View style={{flex:1}}><Text style={styles.tokenName}>{token.name}</Text><Text style={styles.tokenSymbol}>{token.symbol} · {LABELS[token.blockchain]}</Text>{scope === 'all' ? <Text style={styles.tokenScope}>Combined across wallets · Select a wallet for history</Text> : null}</View>
            <View style={{alignItems:'flex-end'}}><Text style={styles.balance}>{token.balance.toFixed(5)} {token.symbol}</Text><Text style={styles.value}>{token.contractAddress ? 'Price data coming soon' : '$' + (token.balanceUSD || 0).toFixed(2)}</Text></View>
          </TouchableOpacity>
        ))}
        {scope === 'wallet' && isLoadingBalances ? <Text style={styles.loading}>Updating balances…</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles=StyleSheet.create({
 container:{flex:1,backgroundColor:'#FFFFFF'},content:{padding:20,paddingBottom:36},
 top:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:16},back:{width:38,height:38,borderRadius:12,backgroundColor:'#F3F0FF',alignItems:'center',justifyContent:'center'},title:{fontSize:25,fontWeight:'900',color:'#211B35'},subtitle:{fontSize:12,color:'#777286',marginTop:3},refresh:{width:38,height:38,borderRadius:12,backgroundColor:'#F3F0FF',alignItems:'center',justifyContent:'center'},
 scopeSwitch:{flexDirection:'row',backgroundColor:'#F3F0FF',padding:4,borderRadius:13,marginBottom:16},scopeOption:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingVertical:10,borderRadius:10},scopeOptionActive:{backgroundColor:'#FFFFFF',shadowColor:'#211B35',shadowOpacity:0.07,shadowRadius:5,elevation:1},scopeText:{fontSize:12,fontWeight:'700',color:'#8A849B'},scopeTextActive:{color:'#6C4CF1'},
 summary:{padding:20,borderRadius:20,backgroundColor:'#F8F6FF',borderWidth:1,borderColor:'#E8E4F3',marginBottom:22},summaryLabel:{fontSize:13,color:'#777286',fontWeight:'600'},summaryValue:{fontSize:34,fontWeight:'900',color:'#211B35',marginTop:6},summaryHint:{fontSize:11,color:'#777286',marginTop:6},loadingRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:12},loading:{color:'#777286',fontSize:11,marginTop:10},
 sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},sectionTitle:{fontSize:17,fontWeight:'800',color:'#211B35'},sectionSubtitle:{fontSize:10,color:'#9993A8',marginTop:3},count:{fontSize:12,color:'#777286'},
 token:{flexDirection:'row',alignItems:'center',padding:15,borderRadius:16,borderWidth:1,borderColor:'#F0EDF7',marginBottom:10},icon:{width:44,height:44,borderRadius:15,alignItems:'center',justifyContent:'center',marginRight:12},logo:{width:28,height:28,borderRadius:14},tokenName:{fontSize:14,fontWeight:'800',color:'#211B35'},tokenSymbol:{fontSize:12,color:'#777286',marginTop:3},tokenScope:{fontSize:10,color:'#6C4CF1',marginTop:3},balance:{fontSize:13,fontWeight:'700',color:'#211B35'},value:{fontSize:11,color:'#777286',marginTop:3},
 empty:{alignItems:'center',paddingVertical:42,gap:8},emptyTitle:{fontSize:16,fontWeight:'800',color:'#211B35'},emptySub:{fontSize:12,color:'#777286',textAlign:'center'},import:{marginTop:8,paddingHorizontal:18,paddingVertical:10,backgroundColor:'#6C4CF1',borderRadius:12},importText:{fontSize:13,fontWeight:'800',color:'#FFFFFF'},error:{fontSize:11,color:'#B45353',marginBottom:10,textAlign:'center'}
});