import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import { useWallet, Blockchain } from '../context/WalletContext';
import { getMnemonic, signSolanaMessage } from '../mobile/services/walletService';

const EVM: Record<string, { symbol: string; name: string; chainId: number; rpc: string }> = {
  ethereum: { symbol: 'ETH', name: 'Ethereum', chainId: 1, rpc: 'https://ethereum-rpc.publicnode.com' },
  bnb: { symbol: 'BNB', name: 'BNB Chain', chainId: 56, rpc: 'https://bsc-rpc.publicnode.com' },
  polygon: { symbol: 'POL', name: 'Polygon', chainId: 137, rpc: 'https://polygon-bor-rpc.publicnode.com' },
};
const TEST: Record<string, { chainId: number; rpc: string }> = {
  ethereum: { chainId: 11155111, rpc: 'https://ethereum-sepolia-rpc.publicnode.com' },
  bnb: { chainId: 97, rpc: 'https://bsc-testnet-rpc.publicnode.com' },
  polygon: { chainId: 80002, rpc: 'https://polygon-amoy-bor-rpc.publicnode.com' },
};
const SYMBOL: Record<Blockchain, string> = { ethereum: 'ETH', bnb: 'BNB', polygon: 'POL', solana: 'SOL' };
const LABEL: Record<Blockchain, string> = { ethereum: 'Ethereum', bnb: 'BNB Chain', polygon: 'Polygon', solana: 'Solana' };
const SOL_RPC = { mainnet: 'https://api.mainnet-beta.solana.com', testnet: 'https://api.devnet.solana.com' };
const shortvec = (n: number) => { const a: number[] = []; while (n >= 128) { a.push((n & 127) | 128); n >>>= 7; } a.push(n); return a; };
const u32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const u64 = (n: bigint) => { const a: number[] = []; for (let i = 0n; i < 8n; i++) a.push(Number((n >> (8n * i)) & 255n)); return a; };
async function solRpc(url: string, method: string, params: unknown[] = []) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!r.ok) throw new Error('Solana RPC request failed.');
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'Solana RPC request failed.');
  return j.result;
}

type Review = { to: string; amount: string; fee: string; feeSymbol: string; network: string; evmTx?: ethers.TransactionRequest; solMessage?: Uint8Array; blockhash?: string; lastValidBlockHeight?: number };

export default function Send() {
  const router = useRouter();
  const { selectedBlockchain, setSelectedBlockchain, network, walletAddresses, isLocked } = useWallet();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [hash, setHash] = useState('');
  const [error, setError] = useState('');
  const address = walletAddresses?.[selectedBlockchain] || '';
  const symbol = SYMBOL[selectedBlockchain];
  const testnet = network === 'testnet';
  const rpc = useMemo(() => selectedBlockchain === 'solana' ? null : (testnet ? TEST[selectedBlockchain] : EVM[selectedBlockchain]), [selectedBlockchain, testnet]);

  const loadBalance = useCallback(async () => {
    if (!address || isLocked) { setBalance(null); return; }
    setLoadingBalance(true);
    try {
      let txHash = '';
      if (selectedBlockchain === 'solana') {
        const r = await solRpc(SOL_RPC[network], 'getBalance', [address, { commitment: 'confirmed' }]);
        setBalance(ethers.formatUnits(BigInt(r.value), 9));
      } else if (rpc) {
        const p = new ethers.JsonRpcProvider(rpc.rpc, rpc.chainId);
        const [b, n] = await Promise.all([p.getBalance(address), p.getNetwork()]);
        if (Number(n.chainId) !== rpc.chainId) throw new Error('RPC network mismatch.');
        setBalance(ethers.formatEther(b));
      }
    } catch (e: any) { setBalance(null); setError(e?.message || 'Unable to load balance.'); }
    finally { setLoadingBalance(false); }
  }, [address, isLocked, selectedBlockchain, network, rpc]);

  useEffect(() => { setReview(null); setError(''); setBalance(null); void loadBalance(); }, [loadBalance]);

  const prepare = async () => {
    setError('');
    if (isLocked) { setError('Unlock your wallet before sending.'); return; }
    if (!to.trim()) { setError('Enter a recipient address.'); return; }
    if (!amount.trim() || !Number.isFinite(Number(amount)) || Number(amount) <= 0) { setError('Enter a valid amount.'); return; }
    setPreparing(true);
    try {
      const mnemonic = await getMnemonic();
      if (!mnemonic) throw new Error('Wallet secret unavailable. Restore your wallet.');
      if (selectedBlockchain === 'solana') {
        const recipient = bs58.decode(to.trim());
        if (recipient.length !== 32) throw new Error('Enter a valid Solana address.');
        if (to.trim() === address) throw new Error('Recipient must be different from your own address.');
        const lamports = ethers.parseUnits(amount, 9);
        const url = SOL_RPC[network];
        const [latest, b] = await Promise.all([
          solRpc(url, 'getLatestBlockhash', [{ commitment: 'confirmed' }]),
          solRpc(url, 'getBalance', [address, { commitment: 'confirmed' }]),
        ]);
        const keys = [...bs58.decode(address), ...recipient, ...bs58.decode('11111111111111111111111111111111')];
        const data = [...u32(2), ...u64(lamports)];
        const msg = Uint8Array.from([1, 0, 1, ...shortvec(3), ...keys, ...bs58.decode(latest.value.blockhash), ...shortvec(1), 2, ...shortvec(2), 0, 1, ...shortvec(data.length), ...data]);
        const feeResult = await solRpc(url, 'getFeeForMessage', [Buffer.from(msg).toString('base64'), { commitment: 'confirmed', encoding: 'base64' }]);
        if (feeResult.value === null) throw new Error('Unable to estimate network fee.');
        const fee = BigInt(feeResult.value);
        if (lamports + fee > BigInt(b.value)) throw new Error('Insufficient SOL for amount and network fee.');
        setReview({ to: to.trim(), amount, fee: ethers.formatUnits(fee, 9), feeSymbol: 'SOL', network: testnet ? 'Solana Devnet' : 'Solana Mainnet', solMessage: msg, blockhash: latest.value.blockhash, lastValidBlockHeight: latest.value.lastValidBlockHeight });
      } else {
        if (!ethers.isAddress(to.trim())) throw new Error('Enter a valid EVM wallet address.');
        if (to.trim().toLowerCase() === address.toLowerCase()) throw new Error('Recipient must be different from your own address.');
        if (!rpc) throw new Error('Unsupported network.');
        const p = new ethers.JsonRpcProvider(rpc.rpc, rpc.chainId);
        const [n, b, fees] = await Promise.all([p.getNetwork(), p.getBalance(address), p.getFeeData()]);
        if (Number(n.chainId) !== rpc.chainId) throw new Error('RPC network mismatch. Transaction cancelled.');
        const value = ethers.parseEther(amount);
        const gasLimit = await p.estimateGas({ from: address, to: ethers.getAddress(to.trim()), value });
        const price = fees.maxFeePerGas ?? fees.gasPrice;
        if (!price) throw new Error('Unable to estimate network fee.');
        const fee = gasLimit * price;
        if (value + fee > b) throw new Error('Insufficient balance for amount plus network fee.');
        const tx: ethers.TransactionRequest = { to: ethers.getAddress(to.trim()), value, gasLimit, chainId: rpc.chainId,
          ...(fees.maxFeePerGas && fees.maxPriorityFeePerGas ? { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas } : { gasPrice: price }) };
        const netName = testnet ? (selectedBlockchain === 'ethereum' ? 'Sepolia' : selectedBlockchain === 'bnb' ? 'BNB Testnet' : 'Polygon Amoy') : LABEL[selectedBlockchain] + ' Mainnet';
        setReview({ to: ethers.getAddress(to.trim()), amount, fee: ethers.formatEther(fee), feeSymbol: symbol, network: netName, evmTx: tx });
      }
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) { setError(e?.shortMessage || e?.message || 'Unable to prepare transaction.'); setReview(null); }
    finally { setPreparing(false); }
  };

  const send = async () => {
    if (!review || sending) return;
    setSending(true); setError('');
    try {
      const mnemonic = await getMnemonic();
      if (!mnemonic) throw new Error('Wallet secret unavailable. Restore your wallet.');
      if (selectedBlockchain === 'solana') {
        if (!review.solMessage || !review.blockhash || review.lastValidBlockHeight === undefined) throw new Error('Transaction review expired. Review again.');
        const sig = await signSolanaMessage(review.solMessage);
        const raw = Uint8Array.from([...shortvec(1), ...sig, ...review.solMessage]);
        txHash = await solRpc(SOL_RPC[network], 'sendTransaction', [Buffer.from(raw).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed', skipPreflight: false }]);
        const c = await solRpc(SOL_RPC[network], 'confirmTransaction', [{ signature: txHash, blockhash: review.blockhash, lastValidBlockHeight: review.lastValidBlockHeight }, { commitment: 'confirmed' }]);
        if (c.value?.err) throw new Error('Solana transaction failed on chain.');
      } else {
        if (!rpc || !review.evmTx) throw new Error('Transaction review expired. Review again.');
        const p = new ethers.JsonRpcProvider(rpc.rpc, rpc.chainId);
        const n = await p.getNetwork();
        if (Number(n.chainId) !== rpc.chainId) throw new Error('Network changed. Transaction cancelled.');
        const w = ethers.HDNodeWallet.fromPhrase(mnemonic).connect(p);
        if (w.address.toLowerCase() !== address.toLowerCase()) throw new Error('Signing account does not match selected wallet.');
        const tx = await w.sendTransaction(review.evmTx);
        txHash = tx.hash;
        await tx.wait(1);
      }
      setHash(txHash);
      setReview(null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void loadBalance();
    } catch (e: any) { setError(e?.shortMessage || e?.message || 'Transaction failed.'); }
    finally { setSending(false); }
  };

  if (hash) return <SafeAreaView style={s.container}><View style={s.success}>
    <View style={s.successIcon}><Ionicons name="checkmark" size={38} color="#FFFFFF" /></View>
    <Text style={s.title}>Transaction confirmed</Text><Text style={s.sub}>The network has confirmed your transfer.</Text>
    <Text selectable style={s.hash}>{hash}</Text>
    <TouchableOpacity style={s.primary} onPress={() => router.replace('/(tabs)/home')}><Text style={s.primaryText}>Back to wallet</Text></TouchableOpacity>
    <TouchableOpacity style={s.secondary} onPress={() => { setHash(''); setTo(''); setAmount(''); }}><Text style={s.secondaryText}>Send another</Text></TouchableOpacity>
  </View></SafeAreaView>;

  return <SafeAreaView style={s.container}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.header}><TouchableOpacity onPress={() => router.back()} style={s.back}><Ionicons name="arrow-back" size={22} color="#211B35" /></TouchableOpacity><Text style={s.headerTitle}>Send</Text><View style={{ width: 40 }} /></View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.eyebrow}>TRANSFER ASSETS</Text><Text style={s.title}>Send crypto</Text><Text style={s.sub}>Transfer assets directly from your wallet.</Text>
      <Text style={s.label}>Network</Text>
      <View style={s.chains}>{(['ethereum', 'bnb', 'polygon', 'solana'] as Blockchain[]).map((c) =>
        <TouchableOpacity key={c} style={[s.chain, selectedBlockchain === c && s.chainActive]} onPress={() => { setSelectedBlockchain(c); setReview(null); }}>
          <Text style={[s.chainText, selectedBlockchain === c && s.chainTextActive]}>{SYMBOL[c]}</Text>
        </TouchableOpacity>)}</View>
      <View style={s.balanceCard}><Ionicons name="wallet-outline" size={16} color="#6C4CF1" /><Text style={s.balanceLabel}>{testnet ? 'Testnet' : 'Mainnet'} · {LABEL[selectedBlockchain]}</Text><View style={{ flex: 1 }} /><Text style={s.balanceValue}>{loadingBalance ? 'Loading…' : balance === null ? '—' : Number(balance).toLocaleString(undefined, { maximumFractionDigits: 6 }) + ' ' + symbol}</Text></View>
      <Text style={s.label}>Recipient address</Text>
      <View style={s.inputCard}><TextInput value={to} onChangeText={(v) => { setTo(v); setReview(null); }} placeholder={selectedBlockchain === 'solana' ? 'Solana address' : '0x recipient address'} placeholderTextColor="#A09AAC" autoCapitalize="none" autoCorrect={false} style={s.input} /><TouchableOpacity onPress={() => setTo('')}><Ionicons name="close-circle" size={19} color="#9A95A8" /></TouchableOpacity></View>
      <Text style={s.label}>Amount</Text>
      <View style={s.amountCard}><TextInput value={amount} onChangeText={(v) => { setAmount(v.replace(/[^0-9.]/g, '')); setReview(null); }} placeholder="0.00" placeholderTextColor="#A09AAC" keyboardType="decimal-pad" style={s.amountInput} /><Text style={s.symbol}>{symbol}</Text><TouchableOpacity style={s.max} onPress={() => { if (balance) setAmount(Math.max(0, Number(balance) - (selectedBlockchain === 'solana' ? 0.00001 : 0.0005)).toFixed(8).replace(/0+$/, '').replace(/\.$/, '')); }}><Text style={s.maxText}>MAX</Text></TouchableOpacity></View>
      <Text style={s.helper}>Available balance: {balance === null ? '—' : Number(balance).toLocaleString(undefined, { maximumFractionDigits: 8 }) + ' ' + symbol}</Text>
      {error ? <View style={s.error}><Ionicons name="alert-circle-outline" size={17} color="#B42318" /><Text style={s.errorText}>{error}</Text></View> : null}
      {review ? <View style={s.review}>
        <Text style={s.reviewTitle}>Review transaction</Text>
        <View style={s.row}><Text style={s.muted}>You send</Text><Text style={s.value}>{review.amount} {symbol}</Text></View>
        <View style={s.row}><Text style={s.muted}>Network</Text><Text style={s.value}>{review.network}</Text></View>
        <View style={s.row}><Text style={s.muted}>Estimated fee</Text><Text style={s.value}>{Number(review.fee).toFixed(8)} {review.feeSymbol}</Text></View>
        <Text style={s.muted}>Recipient</Text><Text selectable style={s.recipient}>{review.to}</Text>
        <Text style={s.warning}>Verify the address and network. Blockchain transfers are generally irreversible.</Text>
        <TouchableOpacity style={[s.primary, sending && s.disabled]} disabled={sending} onPress={send}>{sending ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="lock-closed-outline" size={18} color="#FFFFFF" />}<Text style={s.primaryText}>{sending ? 'Broadcasting…' : 'Confirm & send'}</Text></TouchableOpacity>
        <TouchableOpacity style={s.secondary} disabled={sending} onPress={() => setReview(null)}><Text style={s.secondaryText}>Cancel</Text></TouchableOpacity>
      </View> : null}
    </ScrollView>
    {!review && <View style={s.footer}><TouchableOpacity style={[s.primary, (preparing || loadingBalance || isLocked) && s.disabled]} disabled={preparing || loadingBalance || isLocked} onPress={prepare}>{preparing ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="arrow-up" size={19} color="#FFFFFF" />}<Text style={s.primaryText}>{preparing ? 'Preparing…' : 'Review transaction'}</Text></TouchableOpacity></View>}
  </KeyboardAvoidingView></SafeAreaView>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' }, header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#EEEAF5' }, back: { width: 40 }, headerTitle: { color: '#211B35', fontSize: 17, fontWeight: '800' },
  content: { padding: 20, paddingBottom: 30 }, eyebrow: { color: '#6C4CF1', fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginTop: 8 }, title: { color: '#211B35', fontSize: 27, fontWeight: '900', marginTop: 6 }, sub: { color: '#777286', fontSize: 13, marginTop: 5, marginBottom: 20 },
  label: { color: '#555064', fontSize: 12, fontWeight: '800', marginBottom: 9, marginTop: 17 }, chains: { flexDirection: 'row', gap: 8 }, chain: { flex: 1, alignItems: 'center', paddingVertical: 12, borderWidth: 1, borderColor: '#E8E4F3', borderRadius: 12 }, chainActive: { borderColor: '#6C4CF1', backgroundColor: '#F5F2FF' }, chainText: { color: '#777286', fontSize: 12, fontWeight: '800' }, chainTextActive: { color: '#211B35' },
  balanceCard: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#F7F5FC', borderRadius: 12, padding: 12, marginTop: 12 }, balanceLabel: { color: '#625D70', fontSize: 11, fontWeight: '600' }, balanceValue: { color: '#211B35', fontSize: 11, fontWeight: '800' },
  inputCard: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E8E4F3', borderRadius: 14, paddingHorizontal: 14 }, input: { flex: 1, color: '#211B35', fontSize: 13, paddingVertical: 15 }, amountCard: { minHeight: 60, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E8E4F3', borderRadius: 14, paddingHorizontal: 14 }, amountInput: { flex: 1, color: '#211B35', fontSize: 22, fontWeight: '800', paddingVertical: 12 }, symbol: { color: '#777286', fontSize: 13, fontWeight: '800', marginRight: 12 }, max: { backgroundColor: '#F1EDFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9 }, maxText: { color: '#6C4CF1', fontSize: 11, fontWeight: '900' }, helper: { color: '#918B9F', fontSize: 11, marginTop: 7 },
  error: { flexDirection: 'row', gap: 8, backgroundColor: '#FFF1F0', borderRadius: 12, padding: 12, marginTop: 16 }, errorText: { flex: 1, color: '#B42318', fontSize: 12, lineHeight: 18 },
  review: { backgroundColor: '#FAF9FD', borderWidth: 1, borderColor: '#E8E4F3', borderRadius: 18, padding: 16, marginTop: 22 }, reviewTitle: { color: '#211B35', fontSize: 17, fontWeight: '900', marginBottom: 15 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 12 }, muted: { color: '#777286', fontSize: 12 }, value: { color: '#211B35', fontSize: 12, fontWeight: '800', textAlign: 'right' }, recipient: { color: '#211B35', fontSize: 11, lineHeight: 17, marginTop: 6 }, warning: { color: '#9A6700', backgroundColor: '#FFF7E6', padding: 11, borderRadius: 10, fontSize: 11, lineHeight: 16, marginVertical: 14 },
  footer: { padding: 20, paddingBottom: 26, borderTopWidth: 1, borderTopColor: '#EEEAF5' }, primary: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#6C4CF1', borderRadius: 15, paddingHorizontal: 16 }, primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' }, disabled: { opacity: 0.55 }, secondary: { alignItems: 'center', paddingVertical: 13 }, secondaryText: { color: '#777286', fontSize: 13, fontWeight: '700' },
  success: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 26 }, successIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#16A36A', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }, hash: { color: '#6C4CF1', fontSize: 11, textAlign: 'center', marginVertical: 20, lineHeight: 17 },
});
