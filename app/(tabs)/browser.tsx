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
  Modal,
  ScrollView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import { useWallet } from '../../context/WalletContext';
import { getMnemonic } from '../../mobile/services/walletService';

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
  const { selectedBlockchain, setSelectedBlockchain, network, setNetwork, walletAddresses, isLocked } = useWallet();
  const [connectedOrigin, setConnectedOrigin] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<any>(null);
  const approvalResolver = useRef<((approved: boolean) => void) | null>(null);
  const connectedOriginRef = useRef<string | null>(null);
  const pageUrlRef = useRef('');
  const [url, setUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(false);
  const webRef = useRef<WebView>(null);

  const askApproval = (request: any) => new Promise<boolean>((resolve) => {
    approvalResolver.current = resolve;
    setPendingApproval(request);
  });

  const finishApproval = (approved: boolean) => {
    const resolve = approvalResolver.current;
    approvalResolver.current = null;
    setPendingApproval(null);
    resolve?.(approved);
  };

  const handleProviderMessage = async (event: any) => {
    let m: any;
    try { m = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (m?.type !== 'xu_eip1193_request' || !Number.isInteger(m.id)) return;
    const actualUrl = event.nativeEvent.url || pageUrlRef.current || url;
    let origin = '';
    try { origin = new URL(actualUrl).origin; } catch {}
    const respond = (result: any, error: any = null) => {
      const r = JSON.stringify(result === undefined ? null : result).replace(/</g, '\\u003c');
      const e = JSON.stringify(error).replace(/</g, '\\u003c');
      webRef.current?.injectJavaScript('window.__xuWalletResolve&&window.__xuWalletResolve(' + m.id + ',' + r + ',' + e + ');true;');
    };
    if (!origin.startsWith('https://') || (m.origin && m.origin !== origin)) {
      respond(undefined, { code: 4100, message: 'Invalid DApp origin.' }); return;
    }
    const chains: Record<string, any> = {
      ethereum: { id: 1, rpc: 'https://ethereum-rpc.publicnode.com', name: 'Ethereum Mainnet', testId: 11155111, testRpc: 'https://ethereum-sepolia-rpc.publicnode.com' },
      bnb: { id: 56, rpc: 'https://bsc-rpc.publicnode.com', name: 'BNB Smart Chain', testId: 97, testRpc: 'https://bsc-testnet-rpc.publicnode.com' },
      polygon: { id: 137, rpc: 'https://polygon-bor-rpc.publicnode.com', name: 'Polygon', testId: 80002, testRpc: 'https://polygon-amoy-bor-rpc.publicnode.com' },
    };
    const chainById: Record<number, any> = {
      1:{blockchain:'ethereum',network:'mainnet'},11155111:{blockchain:'ethereum',network:'testnet'},
      56:{blockchain:'bnb',network:'mainnet'},97:{blockchain:'bnb',network:'testnet'},
      137:{blockchain:'polygon',network:'mainnet'},80002:{blockchain:'polygon',network:'testnet'},
    };
    try {
      if (isLocked) throw Object.assign(new Error('Unlock XU Wallet before using DApps.'), {code:4100});
      if (!chains[selectedBlockchain]) throw Object.assign(new Error('EIP-1193 supports Ethereum, BNB Chain and Polygon only.'), {code:4200});
      const cfg = chains[selectedBlockchain];
      const chainId = network === 'testnet' ? cfg.testId : cfg.id;
      const provider = new ethers.JsonRpcProvider(network === 'testnet' ? cfg.testRpc : cfg.rpc);
      const address = walletAddresses?.[selectedBlockchain];
      const params = Array.isArray(m.params) ? m.params : [];
      let result: any;
      switch (m.method) {
        case 'eth_accounts':
          result = connectedOriginRef.current === origin && address ? [address] : [];
          break;
        case 'eth_requestAccounts': {
          if (!address) throw Object.assign(new Error('Wallet address unavailable.'), {code:4100});
          if (connectedOriginRef.current !== origin) {
            const ok = await askApproval({kind:'connect',title:'Connect wallet',origin,chainName:cfg.name,details:['Share your public address with this website.',address,'This does not authorize transactions.']});
            if (!ok) throw Object.assign(new Error('User rejected connection.'), {code:4001});
            connectedOriginRef.current = origin; setConnectedOrigin(origin);
          }
          result = [address];
          webRef.current?.injectJavaScript('if(window.ethereum){window.ethereum.__selectedAddress='+JSON.stringify(address)+';window.ethereum.__chainId='+JSON.stringify('0x'+chainId.toString(16))+';window.ethereum.emit("connect",{chainId:'+JSON.stringify('0x'+chainId.toString(16))+'});window.ethereum.emit("accountsChanged",'+JSON.stringify([address])+')}true;');
          break;
        }
        case 'eth_chainId': result = '0x' + chainId.toString(16); break;
        case 'net_version': result = String(chainId); break;
        case 'wallet_getPermissions': result = connectedOriginRef.current === origin ? [{parentCapability:'eth_accounts'}] : []; break;
        case 'wallet_requestPermissions': {
          if (!params[0]?.eth_accounts) throw Object.assign(new Error('Only eth_accounts permission is supported.'), {code:4200});
          if (!address) throw Object.assign(new Error('Wallet address unavailable.'), {code:4100});
          const ok = connectedOriginRef.current === origin || await askApproval({kind:'connect',title:'Connect wallet',origin,chainName:cfg.name,details:['Allow this website to view your public address.',address]});
          if (!ok) throw Object.assign(new Error('User rejected connection.'), {code:4001});
          connectedOriginRef.current = origin; setConnectedOrigin(origin); result = [{parentCapability:'eth_accounts'}]; break;
        }
        case 'wallet_switchEthereumChain': {
          const id = Number.parseInt(String(params[0]?.chainId || ''), 16);
          const target = chainById[id];
          if (!target) throw Object.assign(new Error('Network not supported.'), {code:4902});
          const ok = await askApproval({kind:'network',title:'Switch network',origin,chainName:chains[target.blockchain].name,details:['Switch active network to '+chains[target.blockchain].name+'.','Chain ID: '+id]});
          if (!ok) throw Object.assign(new Error('User rejected network switch.'), {code:4001});
          setSelectedBlockchain(target.blockchain); setNetwork(target.network);
          webRef.current?.injectJavaScript('if(window.ethereum){window.ethereum.__chainId='+JSON.stringify('0x'+id.toString(16))+';window.ethereum.emit("chainChanged",'+JSON.stringify('0x'+id.toString(16))+')}true;');
          result = null; break;
        }
        case 'wallet_addEthereumChain':
          throw Object.assign(new Error('Custom networks cannot be added from a DApp.'), {code:4200});
        case 'eth_sendTransaction': {
          if (connectedOriginRef.current !== origin) throw Object.assign(new Error('Connect this DApp first.'), {code:4100});
          const tx = params[0];
          if (!tx || typeof tx !== 'object') throw Object.assign(new Error('Invalid transaction.'), {code:-32602});
          if (!address || !tx.from || String(tx.from).toLowerCase() !== address.toLowerCase()) throw Object.assign(new Error('Transaction sender does not match selected wallet.'), {code:4100});
          if (tx.chainId && Number.parseInt(String(tx.chainId),16) !== chainId && Number(tx.chainId) !== chainId) throw Object.assign(new Error('Transaction chain mismatch.'), {code:4901});
          const to = tx.to ? ethers.getAddress(String(tx.to)) : null;
          const data = tx.data ? String(tx.data) : '0x';
          if (!ethers.isHexString(data)) throw Object.assign(new Error('Invalid transaction data.'), {code:-32602});
          const value = tx.value == null ? 0n : BigInt(String(tx.value));
          if (value < 0n) throw Object.assign(new Error('Negative transaction value.'), {code:-32602});
          const request: ethers.TransactionRequest = {to,data,value};
          const feeData = await provider.getFeeData();
          request.gasLimit = tx.gas ? BigInt(String(tx.gas)) : await provider.estimateGas({...request,from:address});
          if (tx.maxFeePerGas) request.maxFeePerGas = BigInt(String(tx.maxFeePerGas));
          if (tx.maxPriorityFeePerGas) request.maxPriorityFeePerGas = BigInt(String(tx.maxPriorityFeePerGas));
          if (tx.gasPrice) request.gasPrice = BigInt(String(tx.gasPrice));
          if (request.maxFeePerGas == null && request.gasPrice == null && feeData.maxFeePerGas != null) {
            request.maxFeePerGas = feeData.maxFeePerGas;
            request.maxPriorityFeePerGas = tx.maxPriorityFeePerGas ? BigInt(String(tx.maxPriorityFeePerGas)) : (feeData.maxPriorityFeePerGas ?? 0n);
          } else if (request.gasPrice == null && request.maxFeePerGas == null && feeData.gasPrice != null) request.gasPrice = feeData.gasPrice;
          const balance = await provider.getBalance(address);
          const maxFee = request.maxFeePerGas ?? request.gasPrice ?? 0n;
          const maxCost = value + BigInt(request.gasLimit || 0n) * maxFee;
          const selector = data.slice(0,10).toLowerCase();
          const details = [
            'Network: '+cfg.name+(network==='testnet'?' Testnet':''),
            'From: '+address,
            'To: '+(to || '(contract creation)'),
            'Native value: '+ethers.formatEther(value)+' '+(selectedBlockchain==='ethereum'?'ETH':selectedBlockchain==='bnb'?'BNB':'POL/MATIC'),
            'Gas limit: '+String(request.gasLimit),
            'Estimated maximum total: '+ethers.formatEther(maxCost)+' native token',
            selector==='0x095ea7b3'?'WARNING: token approval call. Check spender and allowance carefully.':'',
            selector==='0xa9059cbb'?'Token transfer detected; token amount is encoded in contract data.':'',
            data!=='0x'?'Contract selector: '+selector+'; calldata: '+((data.length-2)/2)+' bytes. Generic contract calls are not fully decoded.':'',
          ].filter(Boolean);
          if (balance < maxCost) throw Object.assign(new Error('Insufficient native-token balance for value and estimated fee.'), {code:-32000});
          const ok = await askApproval({kind:'transaction',title:'Review transaction',origin,chainName:cfg.name,details});
          if (!ok) throw Object.assign(new Error('User rejected transaction.'), {code:4001});
          const mnemonic = await getMnemonic();
          if (!mnemonic) throw Object.assign(new Error('Wallet secret unavailable. Restore wallet.'), {code:4100});
          const signer = ethers.Wallet.fromPhrase(mnemonic).connect(provider);
          const sent = await signer.sendTransaction(request);
          result = sent.hash; break;
        }
        case 'personal_sign':
        case 'eth_sign':
        case 'eth_signTypedData':
        case 'eth_signTypedData_v3':
        case 'eth_signTypedData_v4': {
          if (connectedOriginRef.current !== origin) throw Object.assign(new Error('Connect this DApp first.'), {code:4100});
          const typed = String(m.method).startsWith('eth_signTypedData');
          const rawSign = m.method === 'eth_sign';
          const signerAddress = rawSign || typed ? String(params[0] || '') : (ethers.isAddress(String(params[0] || '')) ? String(params[0]) : String(params[1] || ''));
          if (!address || signerAddress.toLowerCase() !== address.toLowerCase()) throw Object.assign(new Error('Signature account mismatch.'), {code:4100});
          let typedData: any = null;
          let messageData: any = null;
          let preview = '';
          if (typed) {
            try { typedData = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1]; } catch { throw Object.assign(new Error('Invalid typed data.'), {code:-32602}); }
            if (!typedData?.domain || !typedData?.types || !typedData?.message || !typedData?.primaryType) throw Object.assign(new Error('Malformed typed data.'), {code:-32602});
            preview = JSON.stringify({domain:typedData.domain,primaryType:typedData.primaryType,message:typedData.message},null,2);
          } else {
            messageData = rawSign ? params[1] : (ethers.isAddress(String(params[0] || '')) ? params[1] : params[0]);
            if (typeof messageData !== 'string') throw Object.assign(new Error('Invalid message.'), {code:-32602});
            preview = messageData.startsWith('0x') ? 'Hex data: '+messageData.slice(0,180)+(messageData.length>180?'…':'') : messageData.slice(0,240);
          }
          const ok = await askApproval({kind:'signature',title:rawSign?'Sign raw data':typed?'Review typed-data signature':'Sign message',origin,chainName:cfg.name,details:['Account: '+address,typed?'Typed data: '+preview:(rawSign?'Raw hash/data: ':'Message: ')+preview,'A signature can authorize off-chain actions. Only approve if you understand the request.']});
          if (!ok) throw Object.assign(new Error('User rejected signature.'), {code:4001});
          const mnemonic = await getMnemonic();
          if (!mnemonic) throw Object.assign(new Error('Wallet secret unavailable.'), {code:4100});
          const signer = ethers.Wallet.fromPhrase(mnemonic);
          if (typed) { const types = {...typedData.types}; delete types.EIP712Domain; result = await signer.signTypedData(typedData.domain,types,typedData.message); }
          else if (rawSign) { if (!ethers.isHexString(messageData,32)) throw Object.assign(new Error('eth_sign requires a 32-byte hash.'), {code:-32602}); result = signer.signingKey.sign(messageData).serialized; }
          else result = await signer.signMessage(messageData.startsWith('0x') && ethers.isHexString(messageData) ? ethers.getBytes(messageData) : messageData);
          break;
        }
        default:
          result = await provider.send(m.method, params);
      }
      respond(result);
    } catch (e: any) {
      respond(undefined,{code:typeof e?.code==='number'?e.code:-32603,message:String(e?.shortMessage||e?.message||'Request failed')});
    }
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


        <Modal visible={!!pendingApproval} transparent animationType="slide" onRequestClose={() => finishApproval(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.approvalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.approvalHeader}>
                <View style={styles.approvalIcon}>
                  <Ionicons name={pendingApproval?.kind === 'transaction' ? 'swap-horizontal' : pendingApproval?.kind === 'signature' ? 'finger-print' : pendingApproval?.kind === 'network' ? 'git-network-outline' : 'wallet-outline'} size={22} color="#C8BFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.approvalTitle}>{pendingApproval?.title || 'Wallet approval'}</Text>
                  <Text style={styles.approvalOrigin} numberOfLines={1}>{pendingApproval?.origin}</Text>
                </View>
              </View>
              <Text style={styles.approvalWarning}>Review carefully. Approval may move assets or authorize an off-chain action.</Text>
              <ScrollView style={styles.approvalDetails} contentContainerStyle={{ paddingBottom: 10 }}>
                {(pendingApproval?.details || []).map((line: string, index: number) => (
                  <View key={index} style={styles.approvalDetailRow}>
                    <Text selectable style={styles.approvalDetail}>{line}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.approvalActions}>
                <TouchableOpacity style={styles.rejectButton} onPress={() => finishApproval(false)}>
                  <Text style={styles.rejectText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.approveButton} onPress={() => finishApproval(true)}>
                  <Text style={styles.approveText}>Approve</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

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
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  approvalSheet: { backgroundColor: '#141622', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, maxHeight: '85%', borderWidth: 1, borderColor: '#343044' },
  modalHandle: { width: 42, height: 4, borderRadius: 3, backgroundColor: '#4C4A5B', alignSelf: 'center', marginBottom: 18 },
  approvalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  approvalIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#28213F', alignItems: 'center', justifyContent: 'center' },
  approvalTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  approvalOrigin: { color: '#A99AFB', fontSize: 12, marginTop: 4 },
  approvalWarning: { color: '#FBBF24', backgroundColor: '#2B2414', borderRadius: 10, padding: 10, fontSize: 11, lineHeight: 16, marginBottom: 12 },
  approvalDetails: { maxHeight: 350, borderRadius: 12, backgroundColor: '#0D0F17', paddingHorizontal: 12, paddingVertical: 4 },
  approvalDetailRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#242634' },
  approvalDetail: { color: '#E3E1EE', fontSize: 12, lineHeight: 18 },
  approvalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  rejectButton: { flex: 1, borderRadius: 13, borderWidth: 1, borderColor: '#484352', paddingVertical: 14, alignItems: 'center' },
  rejectText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  approveButton: { flex: 1, borderRadius: 13, backgroundColor: '#6C4CF1', paddingVertical: 14, alignItems: 'center' },
  approveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
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
