import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { useWallet } from '../context/WalletContext';

const CHAIN_NAMES: Record<string, string> = {
  ethereum: 'Ethereum',
  bnb: 'BNB Chain',
  polygon: 'Polygon',
  solana: 'Solana',
};

function getExplorerUrl(chain: string, network: string, address: string) {
  const encodedAddress = encodeURIComponent(address);
  if (chain === 'solana') {
    const cluster = network === 'testnet' ? 'devnet' : 'mainnet-beta';
    return `https://explorer.solana.com/address/${encodedAddress}?cluster=${cluster}`;
  }
  const hosts: Record<string, { mainnet: string; testnet: string }> = {
    ethereum: { mainnet: 'https://etherscan.io', testnet: 'https://sepolia.etherscan.io' },
    bnb: { mainnet: 'https://bscscan.com', testnet: 'https://testnet.bscscan.com' },
    polygon: { mainnet: 'https://polygonscan.com', testnet: 'https://amoy.polygonscan.com' },
  };
  return `${hosts[chain]?.[network as 'mainnet' | 'testnet'] || hosts.ethereum.mainnet}/address/${encodedAddress}`;
}

export default function TransactionHistory() {
  const router = useRouter();
  const { selectedBlockchain, network, walletAddress } = useWallet();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const explorerUrl = useMemo(
    () => getExplorerUrl(selectedBlockchain, network, walletAddress),
    [selectedBlockchain, network, walletAddress],
  );
  const chainName = CHAIN_NAMES[selectedBlockchain] || selectedBlockchain;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color="#211B35" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Transaction history</Text>
          <Text style={styles.subtitle}>{chainName} · {network.toUpperCase()}</Text>
        </View>
        <TouchableOpacity onPress={() => Linking.openURL(explorerUrl)} style={styles.openButton} accessibilityLabel="Open explorer externally">
          <Ionicons name="open-outline" size={19} color="#6C4CF1" />
        </TouchableOpacity>
      </View>

      <View style={styles.notice}>
        <Ionicons name="shield-checkmark-outline" size={17} color="#6C4CF1" />
        <Text style={styles.noticeText}>Public on-chain activity for this wallet. History is supplied by the network explorer.</Text>
      </View>

      {failed ? (
        <View style={styles.state}>
          <Ionicons name="cloud-offline-outline" size={42} color="#9A95A8" />
          <Text style={styles.stateTitle}>Unable to load transaction history</Text>
          <Text style={styles.stateBody}>The explorer may be temporarily unavailable. You can retry or open it in your browser.</Text>
          <TouchableOpacity style={styles.retry} onPress={() => { setFailed(false); setLoading(true); setReloadKey((value) => value + 1); }}>
            <Ionicons name="refresh" size={17} color="#FFFFFF" />
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.external} onPress={() => Linking.openURL(explorerUrl)}>
            <Text style={styles.externalText}>Open in browser</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.webWrap}>
          {loading ? <View style={styles.loading}><ActivityIndicator size="large" color="#6C4CF1" /><Text style={styles.loadingText}>Loading on-chain activity…</Text></View> : null}
          <WebView
            key={`${explorerUrl}:${reloadKey}`}
            source={{ uri: explorerUrl }}
            onLoadStart={() => { setLoading(true); setFailed(false); }}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setLoading(false); setFailed(true); }}
            onHttpError={(event) => {
              if (event.nativeEvent.statusCode >= 400) { setLoading(false); setFailed(true); }
            }}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState={false}
            setSupportMultipleWindows={false}
            style={styles.webview}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#EEEAF5' },
  back: { width: 40, height: 42, justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { color: '#211B35', fontSize: 17, fontWeight: '800' },
  subtitle: { color: '#777286', fontSize: 11, marginTop: 3, fontWeight: '700' },
  openButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F3F0FF' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F8F6FF' },
  noticeText: { flex: 1, color: '#655B7D', fontSize: 11, lineHeight: 16 },
  webWrap: { flex: 1, backgroundColor: '#FFFFFF' },
  webview: { flex: 1, backgroundColor: '#FFFFFF' },
  loading: { position: 'absolute', zIndex: 2, top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  loadingText: { color: '#777286', fontSize: 12, marginTop: 12 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  stateTitle: { color: '#211B35', fontSize: 17, fontWeight: '800', marginTop: 16, textAlign: 'center' },
  stateBody: { color: '#777286', fontSize: 13, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#6C4CF1', borderRadius: 13, paddingHorizontal: 20, paddingVertical: 13, marginTop: 20 },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  external: { padding: 12, marginTop: 4 },
  externalText: { color: '#6C4CF1', fontSize: 13, fontWeight: '700' },
});
