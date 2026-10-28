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
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import { useWallet } from '../../context/WalletContext';

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

const EIP1193_INJECT = `(function(){
if(window.ethereum&&window.ethereum.isXUWallet)return;
var n=1,p={},l={};
function emit(e,v){(l[e]||[]).forEach(function(f){try{f(v)}catch(_){}})}
function request(a){if(!a||typeof a.method!=="string")return Promise.reject({code:-32600,message:"Invalid request"});return new Promise(function(resolve,reject){var id=n++;p[id]={resolve:resolve,reject:reject};window.ReactNativeWebView.postMessage(JSON.stringify({type:"xu_eip1193_request",id:id,method:a.method,params:a.params||[],origin:location.origin}));})}
window.__xuWalletResolve=function(id,r,e){var x=p[id];if(!x)return;delete p[id];e?x.reject(e):x.resolve(r)};
var w={isXUWallet:true,request:request,on:function(e,f){(l[e]||(l[e]=[])).push(f);return w},removeListener:function(e,f){l[e]=(l[e]||[]).filter(function(x){return x!==f});return w},off:function(e,f){return w.removeListener(e,f)},emit:emit,isConnected:function(){return true}};
Object.defineProperty(w,"selectedAddress",{get:function(){return w.__selectedAddress||null}});Object.defineProperty(w,"chainId",{get:function(){return w.__chainId||null}});
window.ethereum=w;window.dispatchEvent(new Event("ethereum#initialized"));
})(); true;`;

export default function Browser() {
  const { selectedBlockchain, network, walletAddresses, isLocked } = useWallet();
  const [connectedOrigin, setConnectedOrigin] = useState<string | null>(null);
  const connectedOriginRef = useRef<string | null>(null);
  const pageUrlRef = useRef('');
  const [url, setUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(false);
  const webRef = useRef<WebView>(null);
  const handleProviderMessage = async (event: any) => {
    let m: any; try { m = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (m?.type !== 'xu_eip1193_request' || !Number.isInteger(m.id)) return;
    const actualUrl = event.nativeEvent.url || pageUrlRef.current || url;
    let origin = ''; try { origin = new URL(actualUrl).origin; } catch {}
    const respond = (result: any, error: any = null) => webRef.current?.injectJavaScript('window.__xuWalletResolve&&window.__xuWalletResolve(' + m.id + ',' + JSON.stringify(result ?? null) + ',' + JSON.stringify(error) + ');true;');
    if (!origin.startsWith('https://') || (m.origin && m.origin !== origin)) { respond(null, {code:4100,message:'Invalid DApp origin'}); return; }
    try {
      if (isLocked) throw Object.assign(new Error('Unlock XU Wallet first.'), {code:4100});
      const chains: any = { ethereum:{id:1,rpc:'https://ethereum-rpc.publicnode.com',name:'Ethereum'}, bnb:{id:56,rpc:'https://bsc-rpc.publicnode.com',name:'BNB Chain'}, polygon:{id:137,rpc:'https://polygon-bor-rpc.publicnode.com',name:'Polygon'} };
      const cfg = chains[selectedBlockchain]; if (!cfg) throw Object.assign(new Error('EIP-1193 supports EVM chains only.'), {code:4200});
      const test = network === 'testnet'; const chainId = test ? (selectedBlockchain === 'ethereum' ? 11155111 : selectedBlockchain === 'bnb' ? 97 : 80002) : cfg.id;
      const rpc = test ? (selectedBlockchain === 'ethereum' ? 'https://ethereum-sepolia-rpc.publicnode.com' : selectedBlockchain === 'bnb' ? 'https://bsc-testnet-rpc.publicnode.com' : 'https://polygon-amoy-bor-rpc.publicnode.com') : cfg.rpc;
      const provider = new ethers.JsonRpcProvider(rpc); const address = walletAddresses?.[selectedBlockchain]; let result: any;
      switch (m.method) {
        case 'eth_accounts': result = connectedOriginRef.current === origin && address ? [address] : []; break;
        case 'eth_requestAccounts': {
          if (!address) throw Object.assign(new Error('Wallet address unavailable.'), {code:4100});
          if (connectedOriginRef.current !== origin) {
            const ok = await new Promise<boolean>(resolve => Alert.alert('Connect to DApp?', origin + '\\n\\nAllow this site to see your public address on ' + cfg.name + '? This does not authorize transactions.', [{text:'Cancel',style:'cancel',onPress:()=>resolve(false)},{text:'Connect',onPress:()=>resolve(true)}], {cancelable:false}));
            if (!ok) throw Object.assign(new Error('User rejected connection.'), {code:4001}); connectedOriginRef.current=origin; setConnectedOrigin(origin);
          }
          result=[address]; webRef.current?.injectJavaScript('if(window.ethereum){window.ethereum.__selectedAddress=' + JSON.stringify(address) + ';window.ethereum.__chainId=' + JSON.stringify('0x'+chainId.toString(16)) + ';window.ethereum.emit("connect",{chainId:' + JSON.stringify('0x'+chainId.toString(16)) + '});window.ethereum.emit("accountsChanged",' + JSON.stringify([address]) + ')}true;'); break;
        }
        case 'eth_chainId': result='0x'+chainId.toString(16); break;
        case 'net_version': result=String(chainId); break;
        case 'wallet_getPermissions': result=connectedOriginRef.current===origin?[{parentCapability:'eth_accounts'}]:[]; break;
        case 'eth_sendTransaction': case 'eth_sign': case 'personal_sign': case 'eth_signTypedData': case 'eth_signTypedData_v3': case 'eth_signTypedData_v4': case 'wallet_switchEthereumChain': case 'wallet_addEthereumChain': throw Object.assign(new Error('Signing and chain switching are not enabled yet; this request was not signed.'), {code:4200});
        default: result=await provider.send(m.method, Array.isArray(m.params)?m.params:[]);
      }
      respond(result);
    } catch (e: any) { respond(null, {code:typeof e?.code==='number'?e.code:-32603,message:String(e?.shortMessage||e?.message||'Request failed')}); }
  };

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
            pageUrlRef.current = state.url;
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
          injectedJavaScriptBeforeContentLoaded={EIP1193_INJECT}
          onMessage={handleProviderMessage}
          originWhitelist={['https://*', 'http://*']}
          onShouldStartLoadWithRequest={(request) => request.url.startsWith('https://') || request.url.startsWith('http://')}
        />

        {connectedOrigin ? <View style={styles.connectionBadge}><Ionicons name="checkmark-circle" size={15} color="#34D399" /><Text style={styles.connectionText}>Connected to {connectedOrigin}</Text><TouchableOpacity onPress={() => { connectedOriginRef.current = null; setConnectedOrigin(null); webRef.current?.injectJavaScript('if(window.ethereum){window.ethereum.emit("accountsChanged",[])}true;'); }}><Text style={styles.disconnectText}>Disconnect</Text></TouchableOpacity></View> : null}
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
  connectionBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#10251F', borderTopWidth: 1, borderTopColor: '#1D3B31' },
  connectionText: { color: '#A7F3D0', fontSize: 10, flex: 1 },
  disconnectText: { color: '#FCA5A5', fontSize: 10, fontWeight: '700' },
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
