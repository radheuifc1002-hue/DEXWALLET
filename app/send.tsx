import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import * as bip39 from 'bip39';
import * as ed from '@noble/ed25519';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useWallet } from '../context/WalletContext';
import { getMnemonic, getPin } from '../mobile/services/walletService';

type Chain = 'ethereum' | 'bnb' | 'polygon' | 'solana';
type Quote = { fee: string; total: string; balance: string; rawFee: bigint; rawAmount: bigint; address: string; symbol: string };
type Result = { hash: string; explorer: string; status: 'confirmed' | 'pending' | 'failed' };

const CHAINS: Record<Chain, { name: string; symbol: string; decimals: number; chainId?: number; testChainId?: number; rpc: string; testRpc: string; explorer: string; testExplorer: string }> = {
  ethereum: { name: 'Ethereum', symbol: 'ETH', decimals: 18, chainId: 1, testChainId: 11155111, rpc: 'https://ethereum-rpc.publicnode.com', testRpc: 'https://ethereum-sepolia-rpc.publicnode.com', explorer: 'https://etherscan.io/tx/', testExplorer: 'https://sepolia.etherscan.io/tx/' },
  bnb: { name: 'BNB Smart Chain', symbol: 'BNB', decimals: 18, chainId: 56, testChainId: 97, rpc: 'https://bsc-rpc.publicnode.com', testRpc: 'https://bsc-testnet-rpc.publicnode.com', explorer: 'https://bscscan.com/tx/', testExplorer: 'https://testnet.bscscan.com/tx/' },
  polygon: { name: 'Polygon', symbol: 'POL', decimals: 18, chainId: 137, testChainId: 80002, rpc: 'https://polygon-bor-rpc.publicnode.com', testRpc: 'https://polygon-amoy-bor-rpc.publicnode.com', explorer: 'https://polygonscan.com/tx/', testExplorer: 'https://amoy.polygonscan.com/tx/' },
  solana: { name: 'Solana', symbol: 'SOL', decimals: 9, rpc: 'https://api.mainnet-beta.solana.com', testRpc: 'https://api.devnet.solana.com', explorer: 'https://solscan.io/tx/', testExplorer: 'https://solscan.io/tx/' },
};

const rpcCall = async (rpc: string, method: string, params: unknown[]) => {
  const response = await fetch(rpc, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error('Network request failed. Please try again.');
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'Blockchain RPC request failed.');
  return data.result;
};

const shortVec = (value: number): number[] => {
  const out: number[] = [];
  let n = value;
  while (n >= 0x80) { out.push((n & 0x7f) | 0x80); n >>>= 7; }
  out.push(n);
  return out;
};

const validateSolanaAddress = (address: string) => {
  try { return bs58.decode(address).length === 32; } catch { return false; }
};

const makeSolanaTransferMessage = (from: string, to: string, blockhash: string, lamports: bigint): Uint8Array => {
  const systemProgram = '11111111111111111111111111111111';
  const keys = [bs58.decode(from), bs58.decode(to), bs58.decode(systemProgram)];
  const data = new Uint8Array(12);
  data[0] = 2; // SystemProgram.Transfer instruction discriminator (u32 LE).
  let amount = lamports;
  for (let i = 0; i < 8; i++) { data[4 + i] = Number(amount & 255n); amount >>= 8n; }
  return Uint8Array.from([
    1, 0, 1, ...shortVec(3), ...keys.flatMap((key) => Array.from(key)),
    ...bs58.decode(blockhash), ...shortVec(1),
    2, ...shortVec(2), 0, 1, ...shortVec(data.length), ...Array.from(data),
  ]);
};

export default function Send() {
  const router = useRouter();
  const { selectedBlockchain, network, walletAddresses, tokens, isLocked } = useWallet();
  const chain = selectedBlockchain as Chain;
  const config = CHAINS[chain];
  const nativeToken = tokens.find((token) => token.blockchain === chain && !token.contractAddress);
  const fromAddress = walletAddresses?.[chain] || '';
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinVisible, setPinVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<'form' | 'review' | 'result'>('form');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [liveBalance, setLiveBalance] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const isTestnet = network === 'testnet';
  const rpc = isTestnet ? config.testRpc : config.rpc;
  const explorer = isTestnet ? config.testExplorer : config.explorer;
  const symbol = config.symbol;

  useEffect(() => {
    let active = true;
    setLiveBalance(null);
    const loadBalance = async () => {
      try {
        const raw = chain === 'solana'
          ? BigInt((await rpcCall(rpc, 'getBalance', [fromAddress, { commitment: 'confirmed' }])).value)
          : await new ethers.JsonRpcProvider(rpc, isTestnet ? config.testChainId! : config.chainId!, { staticNetwork: true }).getBalance(fromAddress);
        if (active) setLiveBalance(ethers.formatUnits(raw, config.decimals));
      } catch { if (active) setLiveBalance(null); }
    };
    if (fromAddress) void loadBalance();
    return () => { active = false; };
  }, [chain, config, fromAddress, isTestnet, rpc]);

  const parsedAmount = useMemo(() => {
    if (!/^\\d+(\\.\\d*)?$/.test(amount.trim()) || !config) return null;
    try { return ethers.parseUnits(amount.trim(), config.decimals); } catch { return null; }
  }, [amount, config]);

  const validateForm = () => {
    if (isLocked) throw new Error('Unlock your wallet before sending.');
    if (!walletAddresses || !fromAddress) throw new Error('Wallet address is unavailable.');
    if (!recipient.trim()) throw new Error('Enter a recipient address.');
    if (chain === 'solana' ? !validateSolanaAddress(recipient.trim()) : !ethers.isAddress(recipient.trim())) {
      throw new Error('The recipient address is not valid for the selected network.');
    }
    if (chain !== 'solana' && recipient.trim().toLowerCase() === fromAddress.toLowerCase()) throw new Error('You cannot send funds to your own address.');
    if (chain === 'solana' && recipient.trim() === fromAddress) throw new Error('You cannot send funds to your own address.');
    if (parsedAmount === null || parsedAmount <= 0n) throw new Error('Enter a valid amount greater than zero.');
    if (!nativeToken) throw new Error('The selected network asset is unavailable.');
  };

  const getQuote = async (): Promise<Quote> => {
    validateForm();
    const amountRaw = parsedAmount!;
    if (chain === 'solana') {
      const [balanceResult, latest] = await Promise.all([
        rpcCall(rpc, 'getBalance', [fromAddress, { commitment: 'confirmed' }]),
        rpcCall(rpc, 'getLatestBlockhash', [{ commitment: 'confirmed' }]),
      ]);
      const balance = BigInt(balanceResult.value);
      const message = makeSolanaTransferMessage(fromAddress, recipient.trim(), latest.value.blockhash, amountRaw);
      const feeResult = await rpcCall(rpc, 'getFeeForMessage', [Buffer.from(message).toString('base64'), { commitment: 'confirmed' }]);
      if (feeResult.value === null) throw new Error('Could not estimate the Solana network fee.');
      const fee = BigInt(feeResult.value);
      if (balance < amountRaw + fee) throw new Error('Insufficient SOL. Your balance must also cover the network fee.');
      return { fee: ethers.formatUnits(fee, 9), total: ethers.formatUnits(amountRaw + fee, 9), balance: ethers.formatUnits(balance, 9), rawFee: fee, rawAmount: amountRaw, address: recipient.trim(), symbol };
    }
    const chainId = isTestnet ? config.testChainId! : config.chainId!;
    const provider = new ethers.JsonRpcProvider(rpc, chainId, { staticNetwork: true });
    const [balance, feeData, networkInfo] = await Promise.all([
      provider.getBalance(fromAddress), provider.getFeeData(), provider.getNetwork(),
    ]);
    if (Number(networkInfo.chainId) !== chainId) throw new Error('RPC network mismatch. Transaction cancelled.');
    const to = ethers.getAddress(recipient.trim());
    const gasLimit = await provider.estimateGas({ from: fromAddress, to, value: amountRaw });
    const feePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
    if (!feePerGas) throw new Error('Could not estimate the network fee.');
    const fee = (gasLimit * 120n / 100n) * feePerGas;
    if (balance < amountRaw + fee) throw new Error('Insufficient balance. Keep enough native coin to cover the network fee.');
    return { fee: ethers.formatEther(fee), total: ethers.formatEther(amountRaw + fee), balance: ethers.formatEther(balance), rawFee: fee, rawAmount: amountRaw, address: to, symbol };
  };

  const handleReview = async () => {
    setError('');
    setBusy(true);
    try {
      const nextQuote = await getQuote();
      setQuote(nextQuote);
      setStage('review');
      Haptics.selectionAsync();
    } catch (e: any) { setError(e?.message || 'Unable to prepare this transaction.'); }
    finally { setBusy(false); }
  };

  const handleConfirm = async () => {
    if (sendingRef.current || busy) return;
    setError('');
    if (!/^\\d{6}$/.test(pinInput)) { setError('Enter your 6-digit wallet PIN.'); return; }
    setBusy(true);
    sendingRef.current = true;
    try {
      const savedPin = await getPin();
      if (!savedPin || pinInput !== savedPin) throw new Error('Incorrect wallet PIN.');
      if (isLocked) throw new Error('Wallet locked. Unlock it before sending.');
      const mnemonic = await getMnemonic();
      if (!mnemonic) throw new Error('Wallet recovery secret unavailable. Restore your wallet.');
      let hash = '';
      if (chain === 'solana') {
        const derivedSeed = bip39.mnemonicToSeedSync(mnemonic.trim()).slice(0, 32);
        const derivedPublicKey = bs58.encode(await ed.getPublicKeyAsync(derivedSeed));
        if (derivedPublicKey !== fromAddress) throw new Error('Wallet key verification failed. No transaction was sent.');
        const latest = await rpcCall(rpc, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);
        const message = makeSolanaTransferMessage(fromAddress, quote!.address, latest.value.blockhash, quote!.rawAmount);
        const feeResult = await rpcCall(rpc, 'getFeeForMessage', [Buffer.from(message).toString('base64'), { commitment: 'confirmed' }]);
        if (feeResult.value === null) throw new Error('Could not refresh the network fee. Please try again.');
        const fee = BigInt(feeResult.value);
        const balanceResult = await rpcCall(rpc, 'getBalance', [fromAddress, { commitment: 'confirmed' }]);
        if (BigInt(balanceResult.value) < quote!.rawAmount + fee) throw new Error('Insufficient SOL balance for amount and fee.');
        const signature = await ed.signAsync(message, derivedSeed);
        const transaction = Uint8Array.from([...shortVec(1), ...Array.from(signature), ...Array.from(message)]);
        const encoded = Buffer.from(transaction).toString('base64');
        hash = await rpcCall(rpc, 'sendTransaction', [encoded, { encoding: 'base64', preflightCommitment: 'confirmed', skipPreflight: false, maxRetries: 3 }]);
        setResult({ hash, explorer: explorer + hash, status: 'pending' });
        setStage('result');
        setPinVisible(false);
        setPinInput('');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        try {
          for (let attempt = 0; attempt < 40; attempt++) {
            const statuses = await rpcCall(rpc, 'getSignatureStatuses', [[hash], { searchTransactionHistory: true }]);
            const status = statuses.value?.[0];
            if (status?.err) { setResult({ hash, explorer: explorer + hash, status: 'failed' }); break; }
            if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized' || status.confirmations === null)) {
              setResult({ hash, explorer: explorer + hash, status: 'confirmed' }); break;
            }
            const height = await rpcCall(rpc, 'getBlockHeight', [{ commitment: 'confirmed' }]);
            if (height > latest.value.lastValidBlockHeight) break;
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        } catch { /* The signature is submitted; the explorer can show its eventual status. */ }
      } else {
        const chainId = isTestnet ? config.testChainId! : config.chainId!;
        const provider = new ethers.JsonRpcProvider(rpc, chainId, { staticNetwork: true });
        const signer = ethers.Wallet.fromPhrase(mnemonic.trim()).connect(provider);
        if ((await signer.getAddress()).toLowerCase() !== fromAddress.toLowerCase()) throw new Error('Wallet key verification failed. No transaction was sent.');
        const networkInfo = await provider.getNetwork();
        if (Number(networkInfo.chainId) !== chainId) throw new Error('RPC network mismatch. Transaction cancelled.');
        const freshQuote = await getQuote();
        const gasLimit = await provider.estimateGas({ from: fromAddress, to: freshQuote.address, value: freshQuote.rawAmount });
        const balance = await provider.getBalance(fromAddress);
        const feeData = await provider.getFeeData();
        const feePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
        if (!feePerGas) throw new Error('Could not refresh the network fee.');
        const maxFee = (gasLimit * 120n / 100n) * feePerGas;
        if (balance < freshQuote.rawAmount + maxFee) throw new Error('Insufficient balance for amount and updated network fee.');
        const tx = await signer.sendTransaction({ to: freshQuote.address, value: freshQuote.rawAmount, gasLimit: gasLimit * 120n / 100n });
        hash = tx.hash;
        setResult({ hash, explorer: explorer + hash, status: 'pending' });
        setStage('result');
        setPinVisible(false);
        setPinInput('');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        try {
          const receipt = await tx.wait(1);
          if (receipt?.status === 1) setResult({ hash, explorer: explorer + hash, status: 'confirmed' });
          else throw new Error('Transaction reverted.');
        } catch (e: any) {
          if (e?.code === 'CALL_EXCEPTION') setResult({ hash, explorer: explorer + hash, status: 'failed' });
          // A broadcast transaction remains pending/confirming; retain its hash.
        }
      }
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'Transaction failed.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
      sendingRef.current = false;
    }
  };

  const handlePaste = async () => {
    const value = await Clipboard.getStringAsync();
    if (value) { setRecipient(value.trim()); setQuote(null); setError(''); }
  };

  if (stage === 'result' && result) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.resultWrap}>
          <View style={[styles.resultIcon, result.status === 'confirmed' && styles.successIcon]}>
            <Ionicons name={result.status === 'confirmed' ? 'checkmark' : result.status === 'failed' ? 'close' : 'time-outline'} size={34} color={result.status === 'confirmed' ? '#059669' : result.status === 'failed' ? '#DC2626' : '#6C4CF1'} />
          </View>
          <Text style={styles.title}>{result.status === 'confirmed' ? 'Transaction confirmed' : result.status === 'failed' ? 'Transaction failed' : 'Transaction submitted'}</Text>
          <Text style={styles.subtitle}>{result.status === 'confirmed' ? 'Your transfer is confirmed on the network.' : result.status === 'failed' ? 'The network rejected or reverted this transaction. Open the explorer for details.' : 'Your transaction was broadcast. Confirmation may take a little time.'}</Text>
          <View style={styles.hashCard}>
            <Text style={styles.label}>TRANSACTION HASH</Text>
            <Text selectable style={styles.hashText}>{result.hash}</Text>
            <TouchableOpacity onPress={() => Linking.openURL(result.explorer)} style={styles.explorerButton}>
              <Text style={styles.explorerText}>View on block explorer</Text>
              <Ionicons name="open-outline" size={16} color="#6C4CF1" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/(tabs)/home')}>
            <Text style={styles.primaryText}>Back to wallet</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => { setStage('form'); setResult(null); setRecipient(''); setAmount(''); setQuote(null); setError(''); }}>
            <Text style={styles.secondaryText}>Send another</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.back} onPress={() => stage === 'review' ? setStage('form') : router.back()} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={23} color="#211B35" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{stage === 'review' ? 'Review transfer' : 'Send'}</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.networkCard}>
            <View style={styles.networkIcon}><Ionicons name={chain === 'solana' ? 'planet-outline' : 'logo-ethereum'} size={23} color="#6C4CF1" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.networkName}>{config.name}</Text>
              <Text style={styles.networkMeta}>{isTestnet ? 'Test network' : 'Main network'} · Native asset</Text>
            </View>
            <View style={[styles.networkDot, { backgroundColor: isTestnet ? '#D97706' : '#059669' }]} />
          </View>

          {stage === 'form' ? (
            <>
              <Text style={styles.label}>FROM</Text>
              <View style={styles.addressCard}><Text numberOfLines={1} selectable style={styles.addressText}>{fromAddress || 'Wallet address unavailable'}</Text></View>
              <View style={styles.fieldHeader}><Text style={styles.label}>RECIPIENT ADDRESS</Text><TouchableOpacity onPress={handlePaste}><Text style={styles.pasteText}>Paste</Text></TouchableOpacity></View>
              <View style={styles.inputCard}>
                <TextInput value={recipient} onChangeText={(value) => { setRecipient(value.trim()); setQuote(null); }} placeholder={chain === 'solana' ? 'Solana address' : '0x wallet address'} placeholderTextColor="#9A95A8" autoCapitalize="none" autoCorrect={false} autoComplete="off" style={styles.input} />
                {recipient.length > 0 && <TouchableOpacity onPress={() => { setRecipient(''); setQuote(null); }}><Ionicons name="close-circle" size={19} color="#9A95A8" /></TouchableOpacity>}
              </View>
              <Text style={[styles.label, { marginTop: 22 }]}>AMOUNT</Text>
              <View style={styles.amountCard}>
                <TextInput value={amount} onChangeText={(value) => { setAmount(value.replace(/[^0-9.]/g, '')); setQuote(null); }} placeholder="0.00" placeholderTextColor="#9A95A8" keyboardType="decimal-pad" style={styles.amountInput} />
                <Text style={styles.amountSymbol}>{symbol}</Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceText}>Available wallet balance</Text>
                <Text style={styles.balanceValue}>{liveBalance !== null ? Number(liveBalance).toFixed(6) : nativeToken ? nativeToken.balance.toFixed(6) : '—'} {symbol}</Text>
              </View>
              <View style={styles.notice}>
                <Ionicons name="shield-checkmark-outline" size={17} color="#6C4CF1" />
                <Text style={styles.noticeText}>Only send {symbol} on {config.name}. Transfers on the wrong network may be irreversible. Network fees are estimated before confirmation.</Text>
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <TouchableOpacity style={[styles.primaryButton, busy && styles.disabledButton]} onPress={handleReview} disabled={busy} activeOpacity={0.85}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.primaryText}>Review transaction</Text><Ionicons name="arrow-forward" size={18} color="#FFFFFF" /></>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.amountPreview}>
                <Text style={styles.label}>YOU ARE SENDING</Text>
                <Text style={styles.previewAmount}>{amount} <Text style={styles.previewSymbol}>{symbol}</Text></Text>
              </View>
              <Text style={styles.label}>TO</Text>
              <View style={styles.addressCard}><Text selectable style={styles.addressText}>{quote?.address}</Text></View>
              <Text style={styles.label}>FROM</Text>
              <View style={styles.addressCard}><Text selectable style={styles.addressText}>{fromAddress}</Text></View>
              <View style={styles.feeCard}>
                <View style={styles.feeRow}><Text style={styles.feeLabel}>Network fee (estimated)</Text><Text style={styles.feeValue}>{quote?.fee} {symbol}</Text></View>
                <View style={styles.feeDivider} />
                <View style={styles.feeRow}><Text style={styles.feeLabelStrong}>Total deducted (maximum estimate)</Text><Text style={styles.feeValueStrong}>{quote?.total} {symbol}</Text></View>
              </View>
              <Text style={styles.reviewWarning}>Verify the recipient and network carefully. Blockchain transfers cannot normally be reversed.</Text>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <TouchableOpacity style={[styles.primaryButton, busy && styles.disabledButton]} onPress={() => { setPinVisible(true); setPinInput(''); setError(''); }} disabled={busy}>
                <Ionicons name="lock-closed-outline" size={18} color="#FFFFFF" /><Text style={styles.primaryText}>Confirm and send</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
        {pinVisible && (
          <View style={styles.pinBackdrop}>
            <View style={styles.pinSheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.pinTitle}>Authorize transaction</Text>
              <Text style={styles.pinSubtitle}>Enter your 6-digit wallet PIN to sign and broadcast this transfer.</Text>
              <TextInput value={pinInput} onChangeText={(value) => { setPinInput(value.replace(/\\D/g, '').slice(0, 6)); setError(''); }} keyboardType="number-pad" secureTextEntry maxLength={6} autoFocus style={styles.pinInput} placeholder="••••••" placeholderTextColor="#9A95A8" />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <TouchableOpacity style={[styles.primaryButton, (busy || pinInput.length !== 6) && styles.disabledButton]} onPress={handleConfirm} disabled={busy || pinInput.length !== 6}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <><Ionicons name="shield-checkmark" size={18} color="#FFFFFF" /><Text style={styles.primaryText}>Sign & broadcast</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={() => { setPinVisible(false); setPinInput(''); setError(''); }} disabled={busy}><Text style={styles.secondaryText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E8E4F3' },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#211B35', fontSize: 18, fontWeight: '800' },
  scroll: { padding: 20, paddingBottom: 40 },
  networkCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: '#F8F7FC', borderWidth: 1, borderColor: '#E8E4F3', marginBottom: 26 },
  networkIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F0ECFF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  networkName: { color: '#211B35', fontSize: 14, fontWeight: '800' },
  networkMeta: { color: '#777286', fontSize: 11, marginTop: 3 },
  networkDot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: '#777286', fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 9 },
  addressCard: { borderWidth: 1, borderColor: '#E8E4F3', backgroundColor: '#FFFFFF', borderRadius: 13, padding: 14, marginBottom: 22 },
  addressText: { color: '#211B35', fontSize: 12, lineHeight: 19, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  fieldHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pasteText: { color: '#6C4CF1', fontSize: 12, fontWeight: '800', marginBottom: 9 },
  inputCard: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#E8E4F3', borderRadius: 13, paddingHorizontal: 14 },
  input: { flex: 1, color: '#211B35', fontSize: 13, paddingVertical: 13 },
  amountCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E8E4F3', borderRadius: 15, paddingHorizontal: 16 },
  amountInput: { flex: 1, color: '#211B35', fontSize: 27, fontWeight: '700', paddingVertical: 12 },
  amountSymbol: { color: '#6C4CF1', fontSize: 14, fontWeight: '800' },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 20 },
  balanceText: { color: '#777286', fontSize: 11 },
  balanceValue: { color: '#211B35', fontSize: 11, fontWeight: '700' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13, borderRadius: 12, backgroundColor: '#F5F2FF', marginBottom: 22 },
  noticeText: { flex: 1, color: '#625B78', fontSize: 11, lineHeight: 17 },
  errorText: { color: '#DC2626', fontSize: 12, lineHeight: 18, marginBottom: 12 },
  primaryButton: { minHeight: 54, borderRadius: 15, backgroundColor: '#6C4CF1', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 18, marginTop: 8 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  disabledButton: { opacity: 0.55 },
  amountPreview: { alignItems: 'center', paddingVertical: 24, marginBottom: 20, backgroundColor: '#F8F7FC', borderRadius: 16 },
  previewAmount: { color: '#211B35', fontSize: 32, fontWeight: '900', marginTop: 8 },
  previewSymbol: { color: '#6C4CF1', fontSize: 17 },
  feeCard: { borderWidth: 1, borderColor: '#E8E4F3', borderRadius: 14, padding: 15, marginTop: 2, marginBottom: 16 },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  feeLabel: { color: '#777286', fontSize: 11, flex: 1 },
  feeValue: { color: '#211B35', fontSize: 12, fontWeight: '700' },
  feeDivider: { height: 1, backgroundColor: '#EEEAF5', marginVertical: 13 },
  feeLabelStrong: { color: '#211B35', fontSize: 11, fontWeight: '800', flex: 1 },
  feeValueStrong: { color: '#211B35', fontSize: 13, fontWeight: '900' },
  reviewWarning: { color: '#A16207', fontSize: 11, lineHeight: 17, backgroundColor: '#FFFBEB', padding: 12, borderRadius: 11, marginBottom: 12 },
  pinBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,16,38,0.55)', justifyContent: 'flex-end' },
  pinSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 32, borderWidth: 1, borderColor: '#E8E4F3' },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#D8D4E4', alignSelf: 'center', marginBottom: 20 },
  pinTitle: { color: '#211B35', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  pinSubtitle: { color: '#777286', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7, marginBottom: 16 },
  pinInput: { height: 54, borderWidth: 1, borderColor: '#DCD6EF', borderRadius: 13, textAlign: 'center', letterSpacing: 12, fontSize: 22, color: '#211B35', marginBottom: 12 },
  cancelButton: { alignItems: 'center', paddingVertical: 14 },
  secondaryText: { color: '#6C4CF1', fontSize: 14, fontWeight: '800' },
  resultWrap: { flex: 1, justifyContent: 'center', padding: 24, alignItems: 'center' },
  resultIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#F3F0FF', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  successIcon: { backgroundColor: '#ECFDF5' },
  title: { color: '#211B35', fontSize: 22, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: '#777286', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  hashCard: { width: '100%', borderWidth: 1, borderColor: '#E8E4F3', borderRadius: 15, padding: 15, marginBottom: 22 },
  hashText: { color: '#211B35', fontSize: 11, lineHeight: 18, marginTop: 7, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  explorerButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 15 },
  explorerText: { color: '#6C4CF1', fontSize: 12, fontWeight: '800' },
  secondaryButton: { padding: 15, marginTop: 8 },
});
