import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWallet, type Blockchain } from '../context/WalletContext';

const COLORS: Record<Blockchain,string> = { ethereum:'#627EEA', bnb:'#F3BA2F', polygon:'#8247E5', solana:'#9945FF' };
const LABELS: Record<Blockchain,string> = { ethereum:'Ethereum', bnb:'BNB Chain', polygon:'Polygon', solana:'Solana' };

export default function AssetsScreen() {
  const router = useRouter();
  const { tokens, selectedBlockchain, walletAddress, activeWallet, isLoadingBalances, refreshBalances } = useWallet();
  const visible = useMemo(() => tokens.filter((token) => token.blockchain === selectedBlockchain), [tokens, selectedBlockchain]);
  const total = visible.reduce((sum, token) => sum + (token.balanceUSD || 0), 0);
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={22} color="#211B35" /></TouchableOpacity>
          <View style={{flex:1}}>
            <Text style={styles.title}>Assets</Text>
            <Text style={styles.subtitle}>{LABELS[selectedBlockchain]} · {activeWallet?.name || 'Wallet'}</Text>
          </View>
          <TouchableOpacity onPress={() => refreshBalances()} style={styles.refresh}><Ionicons name="refresh" size={18} color="#6C4CF1" /></TouchableOpacity>
        </View>
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>Network portfolio</Text>
          <Text style={styles.summaryValue}>${total.toFixed(2)}</Text>
          <Text style={styles.address}>{walletAddress ? walletAddress.slice(0,9)+'…'+walletAddress.slice(-7) : 'No address for this network'}</Text>
        </View>
        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Tokens on {LABELS[selectedBlockchain]}</Text><Text style={styles.count}>{visible.length} assets</Text></View>
        {visible.length === 0 ? <View style={styles.empty}><Ionicons name="cube-outline" size={38} color="#9B97B2"/><Text style={styles.emptyTitle}>No assets found</Text><Text style={styles.emptySub}>Import a token on this network to see it here.</Text><TouchableOpacity style={styles.import} onPress={() => router.push('/import-token')}><Text style={styles.importText}>Import token</Text></TouchableOpacity></View> : visible.map((token) => (
          <TouchableOpacity key={token.id} style={styles.token} activeOpacity={0.8} onPress={() => router.push({pathname:'/asset-details',params:{assetId:token.id,name:token.name,symbol:token.symbol,blockchain:token.blockchain,contractAddress:token.contractAddress||'',decimals:String(token.decimals??18),isNative:token.contractAddress?'false':'true'}})}>
            <View style={[styles.icon,{backgroundColor:(COLORS[token.blockchain]||'#6C4CF1')+'20'}]}><Ionicons name={token.blockchain==='ethereum'?'logo-ethereum':token.blockchain==='solana'?'planet-outline':token.blockchain==='bnb'?'logo-bitcoin':'triangle-outline'} size={22} color={COLORS[token.blockchain]}/></View>
            <View style={{flex:1}}><Text style={styles.tokenName}>{token.name}</Text><Text style={styles.tokenSymbol}>{token.symbol} · {LABELS[token.blockchain]}</Text></View>
            <View style={{alignItems:'flex-end'}}><Text style={styles.balance}>{token.balance.toFixed(5)} {token.symbol}</Text><Text style={styles.value}>${(token.balanceUSD||0).toFixed(2)}</Text></View>
          </TouchableOpacity>
        ))}
        {isLoadingBalances ? <Text style={styles.loading}>Updating balances…</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles=StyleSheet.create({
 container:{flex:1,backgroundColor:'#FFFFFF'},content:{padding:20,paddingBottom:36},
 top:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:20},back:{width:38,height:38,borderRadius:12,backgroundColor:'#F3F0FF',alignItems:'center',justifyContent:'center'},title:{fontSize:25,fontWeight:'900',color:'#211B35'},subtitle:{fontSize:12,color:'#777286',marginTop:3},refresh:{width:38,height:38,borderRadius:12,backgroundColor:'#F3F0FF',alignItems:'center',justifyContent:'center'},
 summary:{padding:20,borderRadius:20,backgroundColor:'#F8F6FF',borderWidth:1,borderColor:'#E8E4F3',marginBottom:24},summaryLabel:{fontSize:13,color:'#777286',fontWeight:'600'},summaryValue:{fontSize:34,fontWeight:'900',color:'#211B35',marginTop:6},address:{fontSize:11,color:'#777286',marginTop:8,fontFamily:'monospace'},
 sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},sectionTitle:{fontSize:17,fontWeight:'800',color:'#211B35'},count:{fontSize:12,color:'#777286'},
 token:{flexDirection:'row',alignItems:'center',padding:15,borderRadius:16,borderWidth:1,borderColor:'#F0EDF7',marginBottom:10},icon:{width:44,height:44,borderRadius:15,alignItems:'center',justifyContent:'center',marginRight:12},tokenName:{fontSize:14,fontWeight:'800',color:'#211B35'},tokenSymbol:{fontSize:12,color:'#777286',marginTop:3},balance:{fontSize:13,fontWeight:'700',color:'#211B35'},value:{fontSize:12,color:'#777286',marginTop:3},
 empty:{alignItems:'center',paddingVertical:42,gap:8},emptyTitle:{fontSize:16,fontWeight:'800',color:'#211B35'},emptySub:{fontSize:12,color:'#777286',textAlign:'center'},import:{marginTop:8,paddingHorizontal:18,paddingVertical:10,backgroundColor:'#6C4CF1',borderRadius:12},importText:{fontSize:13,fontWeight:'800',color:'#FFFFFF'},loading:{textAlign:'center',color:'#777286',fontSize:12,marginTop:12}
});
