import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import { useWallet, Blockchain, Token } from '../context/WalletContext';
import { getCentralEvmChainId, serverRpcRequest } from '../mobile/services/serverRpc';

const ABI = ['function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function balanceOf(address) view returns (uint256)'];
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';



export default function ImportToken() {
  const router = useRouter();
  const { selectedBlockchain, network, walletAddress, addToken, isLocked } = useWallet();
  const [mintOrContract, setMintOrContract] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<Token | null>(null);
  const [error, setError] = useState('');
  const isSolana = selectedBlockchain === 'solana';
  const isTron = selectedBlockchain === 'tron';

  const tronHexAddress = (address: string) => {
    const decoded = bs58.decode(address);
    if (decoded.length !== 25) throw new Error('Enter a valid TRON address.');
    return Buffer.from(decoded.slice(0, 21)).toString('hex');
  };
  const tronConstantCall = async (contractAddress: string, ownerAddress: string, selector: string, parameter = '') => {
    const result = await serverRpcRequest<any>('tron', network, 'triggerconstantcontract', [{
      owner_address: tronHexAddress(ownerAddress),
      contract_address: tronHexAddress(contractAddress),
      function_selector: selector,
      parameter,
      visible: false,
    }]);
    if (!result?.result?.result || !Array.isArray(result.constant_result) || !result.constant_result[0]) {
      throw new Error('TRON token contract call failed. Verify the TRC-20 contract and selected network.');
    }
    return '0x' + result.constant_result[0];
  };

  const fetchToken = async () => {
    setError('');
    setToken(null);
    if (isLocked) { setError('Unlock your wallet before importing tokens.'); return; }
    const value = mintOrContract.trim();
    if (!value) return;
    setLoading(true);
    try {
      let found: Token;
      if (isSolana) {
        const decoded = bs58.decode(value);
        if (decoded.length !== 32) throw new Error('Enter a valid Solana token mint address.');
        const account=await serverRpcRequest<any>('solana',network,'getAccountInfo',[value,{encoding:'base64',commitment:'confirmed'}]);
        if (!account?.value || ![TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(account.value.owner)) throw new Error('Token not found. This address is not a supported SPL token mint on the selected Solana network.');
        const mintData = Buffer.from(account.value.data[0], 'base64');
        if (mintData.length < 82) throw new Error('Invalid SPL mint account data.');
        const decimals = mintData[44];
        const accountResults = await Promise.all([TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map(programId => serverRpcRequest<any>('solana',network,'getTokenAccountsByOwner',[walletAddress,{mint:value,programId},{encoding:'jsonParsed',commitment:'confirmed'}])));
        const balance = accountResults.flatMap(result => result?.value || []).reduce((sum: number, item: any) => sum + Number(item.account.data.parsed.info.tokenAmount.uiAmountString || 0), 0);
        let name = 'Solana SPL Token';
        let symbol = `SPL-${value.slice(0, 4)}`;
        try {
          const metadataResponse = await fetch(`https://tokens.jup.ag/token/${value}`);
          if (metadataResponse.ok) {
            const metadata = await metadataResponse.json();
            if (metadata?.name) name = metadata.name;
            if (metadata?.symbol) symbol = metadata.symbol;
          }
        } catch {}
        found = { id: `custom-${selectedBlockchain}-${value}`, name, symbol, balance, balanceUSD: 0, contractAddress: value, decimals, blockchain: selectedBlockchain };
      } else if (isTron) {
        if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) throw new Error('Enter a valid TRC-20 contract address.');
        const contractHex = tronHexAddress(value);
        const ownerHex = tronHexAddress(walletAddress);
        const [nameRaw, symbolRaw, decimalsRaw, balanceRaw] = await Promise.all([
          tronConstantCall(value, walletAddress, 'name()'),
          tronConstantCall(value, walletAddress, 'symbol()'),
          tronConstantCall(value, walletAddress, 'decimals()'),
          tronConstantCall(value, walletAddress, 'balanceOf(address)', ownerHex.slice(2).padStart(64, '0')),
        ]);
        const abi = ethers.AbiCoder.defaultAbiCoder();
        const decodeText = (raw: string) => { try { return String(abi.decode(['string'], raw)[0]); } catch { return String(abi.decode(['bytes32'], raw)[0]).replace(/\\0+$/, ''); } };
        const name = decodeText(nameRaw), symbol = decodeText(symbolRaw);
        const decimals = Number(abi.decode(['uint256'], decimalsRaw)[0]);
        const rawBalance = abi.decode(['uint256'], balanceRaw)[0];
        if (!name || !symbol || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('Invalid TRC-20 token metadata.');
        found = { id: `custom-tron-${value}`, name, symbol, balance: Number(ethers.formatUnits(rawBalance, decimals)), balanceUSD: 0, contractAddress: value, decimals, blockchain: 'tron' };
      } else {
        if (!['ethereum','bnb','polygon','arbitrum'].includes(selectedBlockchain)) throw new Error('Custom token import is not supported on this chain.');
        const evmChain = selectedBlockchain as Exclude<Blockchain,'solana'|'bitcoin'|'tron'>;
        const chainId=getCentralEvmChainId(evmChain,network);
        if (!ethers.isAddress(value)) throw new Error('Enter a valid token contract address.');
        const checksumAddress = ethers.getAddress(value);
        const [actualChainId, bytecode] = await Promise.all([
          serverRpcRequest<string>(selectedBlockchain,network,'eth_chainId',[]),
          serverRpcRequest<string>(selectedBlockchain,network,'eth_getCode',[checksumAddress,'latest']),
        ]);
        if (Number(BigInt(actualChainId)) !== chainId) throw new Error('RPC network mismatch. Import cancelled.');
        if (!bytecode || bytecode === '0x') throw new Error('Token not found. No smart contract exists at this address on the selected network.');
        const iface = new ethers.Interface(ABI);
        const [nameRaw,symbolRaw,decimalsRaw,balanceRaw] = await Promise.all([
          serverRpcRequest<string>(selectedBlockchain,network,'eth_call',[{to:checksumAddress,data:iface.encodeFunctionData('name',[])},'latest']),
          serverRpcRequest<string>(selectedBlockchain,network,'eth_call',[{to:checksumAddress,data:iface.encodeFunctionData('symbol',[])},'latest']),
          serverRpcRequest<string>(selectedBlockchain,network,'eth_call',[{to:checksumAddress,data:iface.encodeFunctionData('decimals',[])},'latest']),
          serverRpcRequest<string>(selectedBlockchain,network,'eth_call',[{to:checksumAddress,data:iface.encodeFunctionData('balanceOf',[walletAddress])},'latest']),
        ]);
        const [name]=iface.decodeFunctionResult('name',nameRaw);
        const [symbol]=iface.decodeFunctionResult('symbol',symbolRaw);
        const [decimals]=iface.decodeFunctionResult('decimals',decimalsRaw);
        const [rawBalance]=iface.decodeFunctionResult('balanceOf',balanceRaw);
        const d = Number(decimals);
        if (!Number.isInteger(d) || d < 0 || d > 255) throw new Error('Token returned invalid decimals.');
        found = { id: `custom-${selectedBlockchain}-${value.toLowerCase()}`, name: String(name), symbol: String(symbol), balance: Number(ethers.formatUnits(rawBalance, d)), balanceUSD: 0, contractAddress: ethers.getAddress(value), decimals: d, blockchain: selectedBlockchain };
      }
      setToken(found);
    } catch (e: any) {
      const message = String(e?.shortMessage || e?.message || '');
      const code = String(e?.code || '');
      if (/could not (decode|resolve).*result|call exception|bad data|missing revert data|no matching fragment|execution reverted|invalid opcode/i.test(message) || ['CALL_EXCEPTION', 'BAD_DATA'].includes(code)) {
        setError('Token not found. This address does not expose valid token details on the selected network. Check the contract address and network.');
      } else {
        setError(message || 'Unable to fetch token information. Please check your connection and try again.');
      }
    } finally { setLoading(false); }
  };

  const importToken = () => {
    if (!token) return;
    addToken(token);
    router.replace('/(tabs)/home');
  };

  return <SafeAreaView style={s.container}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}><Ionicons name="arrow-back" size={22} color="#211B35" /></TouchableOpacity>
        <Text style={s.headerTitle}>Import token</Text><View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Add a custom asset</Text>
        <Text style={s.subtitle}>{isSolana ? 'Import an SPL or Token-2022 asset using its mint address.' : isTron ? 'Import a TRC-20 token using its contract address.' : `Import an ERC-20 token on ${selectedBlockchain === 'bnb' ? 'BNB Chain' : selectedBlockchain === 'polygon' ? 'Polygon' : selectedBlockchain === 'arbitrum' ? 'Arbitrum' : 'Ethereum'}.`}</Text>
        <View style={s.network}><Ionicons name={'globe-outline'} size={18} color="#6C4CF1" /><Text style={s.networkText}>{selectedBlockchain.toUpperCase()} · {network.toUpperCase()}</Text></View>
        <Text style={s.label}>{isSolana ? 'Token mint address' : 'Contract address'}</Text>
        <View style={s.inputCard}>
          <TextInput value={mintOrContract} onChangeText={(v) => { setMintOrContract(v); setToken(null); setError(''); }} placeholder={isSolana ? 'Enter SPL mint address' : isTron ? 'T...' : '0x...'} placeholderTextColor="#A09AAC" autoCapitalize="none" autoCorrect={false} style={s.input} />
          <TouchableOpacity onPress={async () => { const value = await Clipboard.getStringAsync(); setMintOrContract(value.trim()); setToken(null); }}><Ionicons name="clipboard-outline" size={20} color="#6C4CF1" /></TouchableOpacity>
        </View>
        <TouchableOpacity style={[s.primary, loading && s.disabled]} disabled={loading || !mintOrContract.trim()} onPress={fetchToken}>
          {loading ? <ActivityIndicator color="#fff" /> : <Ionicons name="search" size={18} color="#fff" />}
          <Text style={s.primaryText}>{loading ? 'Checking on network…' : 'Fetch token details'}</Text>
        </TouchableOpacity>
        {error ? <View style={s.error}><Ionicons name="alert-circle-outline" size={18} color="#B42318" /><Text style={s.errorText}>{error}</Text></View> : null}
        {token ? <View style={s.preview}>
          <View style={s.previewHeader}><Ionicons name="checkmark-circle" size={21} color="#16A36A" /><Text style={s.previewTitle}>Token verified</Text></View>
          <View style={s.row}><Text style={s.muted}>Name</Text><Text style={s.value}>{token.name}</Text></View>
          <View style={s.row}><Text style={s.muted}>Symbol</Text><Text style={s.value}>{token.symbol}</Text></View>
          <View style={s.row}><Text style={s.muted}>Decimals</Text><Text style={s.value}>{token.decimals}</Text></View>
          <View style={s.row}><Text style={s.muted}>Wallet balance</Text><Text style={s.value}>{token.balance} {token.symbol}</Text></View>
          <Text style={s.muted}>Token address</Text><Text selectable style={s.address}>{token.contractAddress}</Text>
          <Text style={s.notice}>Token prices are not yet sourced, so the USD value is shown as $0.00.</Text>
          <TouchableOpacity style={s.primary} onPress={importToken}><Ionicons name="add-circle-outline" size={18} color="#fff" /><Text style={s.primaryText}>Import asset</Text></TouchableOpacity>
        </View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#EEEAF5' },
  back: { width: 40 }, headerTitle: { color: '#211B35', fontSize: 17, fontWeight: '800' },
  content: { padding: 20, paddingBottom: 36 }, title: { color: '#211B35', fontSize: 26, fontWeight: '900', marginTop: 10 }, subtitle: { color: '#777286', fontSize: 13, lineHeight: 20, marginTop: 7, marginBottom: 18 },
  network: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 13, borderRadius: 12, backgroundColor: '#F5F2FF' }, networkText: { color: '#51476E', fontSize: 12, fontWeight: '800' },
  label: { color: '#555064', fontSize: 12, fontWeight: '800', marginTop: 22, marginBottom: 9 },
  inputCard: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E8E4F3', borderRadius: 14, paddingHorizontal: 14 },
  input: { flex: 1, color: '#211B35', fontSize: 12, paddingVertical: 14 },
  primary: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#6C4CF1', borderRadius: 14, marginTop: 16 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '800' }, disabled: { opacity: .55 },
  error: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#FFF1F0', borderRadius: 12, marginTop: 14 }, errorText: { flex: 1, color: '#B42318', fontSize: 12, lineHeight: 18 },
  preview: { borderWidth: 1, borderColor: '#E8E4F3', borderRadius: 18, padding: 16, marginTop: 22, backgroundColor: '#FAF9FD' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }, previewTitle: { color: '#211B35', fontSize: 16, fontWeight: '900' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 12 }, muted: { color: '#777286', fontSize: 12 }, value: { color: '#211B35', fontSize: 12, fontWeight: '800', textAlign: 'right' },
  address: { color: '#211B35', fontSize: 10, lineHeight: 16, marginTop: 6 }, notice: { color: '#8A6A20', fontSize: 11, lineHeight: 16, marginTop: 14, marginBottom: 2 },
});
