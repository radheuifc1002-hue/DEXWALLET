import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

type DAppShortcut = {
  name: string;
  url: string;
  domain: string;
  category: string;
};

const DAPP_SHORTCUTS: DAppShortcut[] = [
  { name: 'Uniswap', url: 'https://app.uniswap.org', domain: 'app.uniswap.org', category: 'DEX' },
  { name: 'Hyperliquid', url: 'https://app.hyperliquid.xyz', domain: 'hyperliquid.xyz', category: 'Perps' },
  { name: 'Jupiter', url: 'https://jup.ag', domain: 'jup.ag', category: 'Solana' },
  { name: 'Aave', url: 'https://app.aave.com', domain: 'aave.com', category: 'Lending' },
  { name: 'PancakeSwap', url: 'https://pancakeswap.finance', domain: 'pancakeswap.finance', category: 'DEX' },
  { name: 'Polymarket', url: 'https://polymarket.com', domain: 'polymarket.com', category: 'Predictions' },
  { name: 'OpenSea', url: 'https://opensea.io', domain: 'opensea.io', category: 'NFT' },
  { name: 'Lido', url: 'https://lido.fi', domain: 'lido.fi', category: 'Staking' },
  { name: 'Morpho', url: 'https://app.morpho.org', domain: 'morpho.org', category: 'Lending' },
  { name: 'Aerodrome', url: 'https://aerodrome.finance', domain: 'aerodrome.finance', category: 'Base' },
  { name: 'Raydium', url: 'https://raydium.io', domain: 'raydium.io', category: 'Solana' },
  { name: 'Magic Eden', url: 'https://magiceden.io', domain: 'magiceden.io', category: 'NFT' },
];

function DAppLogo({ domain, name }: { domain: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={styles.logoFallback}>
        <Text style={styles.logoInitial}>{name.slice(0, 1)}</Text>
      </View>
    );
  }
  return (
    <View style={styles.logoFrame}>
      <Image
        source={{ uri: `https://www.google.com/s2/favicons?domain=${domain}&sz=128` }}
        style={styles.dappLogo}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

export default function Browser() {
  const [url, setUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(false);
  const webRef = useRef<WebView>(null);

  const navigate = (target: string) => {
    const trimmed = target.trim();
    if (!trimmed) return;
    const dest = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : trimmed.includes('.') && !trimmed.includes(' ')
        ? `https://${trimmed}`
        : `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
    setUrl(dest);
    setInputUrl(dest);
  };

  const handleSubmit = () => {
    if (inputUrl.trim()) navigate(inputUrl);
  };

  if (!url) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.eyebrow}>EXPLORE WEB3</Text>
            <Text style={styles.pageTitle}>DApp Browser</Text>
            <Text style={styles.subtitle}>Your gateway to decentralized apps.</Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name="globe-outline" size={22} color="#B7A5FF" />
          </View>
        </View>

        <View style={styles.urlBar}>
          <Ionicons name="search-outline" size={18} color="#9B97B2" />
          <TextInput
            style={styles.urlInput}
            value={inputUrl}
            onChangeText={setInputUrl}
            onSubmitEditing={handleSubmit}
            placeholder="Search dapps or enter a URL"
            placeholderTextColor="#77748C"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
          />
          {inputUrl ? (
            <TouchableOpacity onPress={() => setInputUrl('')} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color="#9B97B2" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.safetyNote}>
          <Ionicons name="shield-checkmark-outline" size={15} color="#A99AFB" />
          <Text style={styles.safetyText}>Check URLs carefully before connecting your wallet.</Text>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Popular DApps</Text>
            <Text style={styles.sectionSubtitle}>Explore trending Web3 destinations</Text>
          </View>
          <Text style={styles.countBadge}>{DAPP_SHORTCUTS.length} apps</Text>
        </View>

        <View style={styles.grid}>
          {DAPP_SHORTCUTS.map((app) => (
            <TouchableOpacity
              key={app.url}
              style={styles.dappCard}
              onPress={() => navigate(app.url)}
              activeOpacity={0.78}
            >
              <DAppLogo domain={app.domain} name={app.name} />
              <Text style={styles.dappName} numberOfLines={1}>{app.name}</Text>
              <Text style={styles.dappCategory} numberOfLines={1}>{app.category}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.urlBar}>
          <Ionicons
            name={loading ? 'reload-outline' : 'lock-closed-outline'}
            size={16}
            color="#A99AFB"
          />
          <TextInput
            style={styles.urlInput}
            value={inputUrl}
            onChangeText={setInputUrl}
            onSubmitEditing={handleSubmit}
            placeholder="Enter URL or search"
            placeholderTextColor="#77748C"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
          />
          <TouchableOpacity onPress={handleSubmit} accessibilityLabel="Go to address">
            <Ionicons name="arrow-forward-circle" size={23} color="#B7A5FF" />
          </TouchableOpacity>
        </View>

        <WebView
          ref={webRef}
          source={{ uri: url }}
          style={{ flex: 1, backgroundColor: '#0F0E17' }}
          onNavigationStateChange={(state) => {
            setCanGoBack(state.canGoBack);
            setCanGoForward(state.canGoForward);
            setInputUrl(state.url);
            setLoading(state.loading);
          }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          setSupportMultipleWindows={false}
        />

        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => webRef.current?.goBack()} disabled={!canGoBack} style={[styles.navBtn, !canGoBack && styles.navBtnDisabled]} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => webRef.current?.goForward()} disabled={!canGoForward} style={[styles.navBtn, !canGoForward && styles.navBtnDisabled]} accessibilityLabel="Go forward">
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => webRef.current?.reload()} style={styles.navBtn} accessibilityLabel="Reload page">
            <Ionicons name="reload" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setUrl(''); setInputUrl(''); }} style={styles.navBtn} accessibilityLabel="Browser home">
            <Ionicons name="home-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0D12', paddingHorizontal: 14 },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 20,
  },
  eyebrow: { color: '#B7A5FF', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  pageTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', marginTop: 5, letterSpacing: -0.5 },
  subtitle: { color: '#9290A5', fontSize: 12, marginTop: 5 },
  headerIcon: {
    width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1A1730', borderWidth: 1, borderColor: '#30264F',
  },
  urlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#171923',
    borderWidth: 1,
    borderColor: '#292B38',
    marginBottom: 10,
    paddingHorizontal: 13,
    borderRadius: 15,
    minHeight: 48,
  },
  urlInput: { flex: 1, color: '#FFFFFF', fontSize: 13, paddingVertical: 12 },
  safetyNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 22, paddingHorizontal: 2 },
  safetyText: { color: '#77748C', fontSize: 10, flex: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  sectionTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  sectionSubtitle: { color: '#77748C', fontSize: 11, marginTop: 4 },
  countBadge: { color: '#B7A5FF', fontSize: 10, backgroundColor: '#201B37', overflow: 'hidden', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, paddingBottom: 20 },
  dappCard: {
    width: '31.5%',
    minHeight: 116,
    backgroundColor: '#151720',
    borderWidth: 1,
    borderColor: '#282A36',
    borderRadius: 17,
    paddingVertical: 13,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  logoFrame: {
    width: 43, height: 43, borderRadius: 14, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  dappLogo: { width: 34, height: 34 },
  logoFallback: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#292341', alignItems: 'center', justifyContent: 'center' },
  logoInitial: { color: '#C8BFFF', fontSize: 20, fontWeight: '800' },
  dappName: { color: '#F7F6FC', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  dappCategory: { color: '#858198', fontSize: 9, textAlign: 'center' },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#0B0D12',
    borderTopWidth: 1,
    borderTopColor: '#262834',
    height: 54,
    paddingHorizontal: 20,
  },
  navBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#1B1D28' },
  navBtnDisabled: { opacity: 0.3 },
});
