import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import { sha256 } from '@noble/hashes/sha2.js';
import { useWallet, Blockchain, Token } from '../context/WalletContext';
import { getMnemonic, signSolanaMessage, deriveAddresses } from '../mobile/services/walletService';
import { getCentralEvmChainId, serverRpcRequest } from '../mobile/services/serverRpc';

const SYMBOL: Record<Blockchain, string> = { ethereum: 'ETH', bnb: 'BNB', polygon: 'POL', solana: 'SOL' };
const LABEL: Record<Blockchain, string> = { ethereum: 'Ethereum', bnb: 'BNB Chain', polygon: 'Polygon', solana: 'Solana' };
const TOKEN_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
];
const shortvec = (n: number) => { const a: number[] = []; while (n >= 128) { a.push((n & 127) | 128); n >>>= 7; } a.push(n); return a; };
const u32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const u64 = (n: bigint) => { const a: number[] = []; for (let i = 0n; i < 8n; i++) a.push(Number((n >> (8n * i)) & 255n)); return a; };
const SOL_SYSTEM_PROGRAM = '11111111111111111111111111111111';
const SOL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SOL_TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const SOL_ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
type SolanaAccountMeta = { pubkey: string; isSigner: boolean; isWritable: boolean };
type SolanaInstruction = { programId: string; keys: SolanaAccountMeta[]; data: number[] };

const mod = (value: bigint, p: bigint) => ((value % p) + p) % p;
function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let value = mod(base, modulus);
  let power = exponent;
  while (power > 0n) {
    if (power & 1n) result = (result * value) % modulus;
    value = (value * value) % modulus;
    power >>= 1n;
  }
  return result;
}
function isEd25519Point(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  const p = (1n << 255n) - 19n;
  const encoded = Uint8Array.from(bytes);
  const sign = encoded[31] >>> 7;
  encoded[31] &= 0x7f;
  let y = 0n;
  for (let i = 31; i >= 0; i -= 1) y = (y << 8n) | BigInt(encoded[i]);
  if (y >= p) return false;
  const d = mod(-121665n * modPow(121666n, p - 2n, p), p);
  const y2 = (y * y) % p;
  const x2 = mod((y2 - 1n) * modPow(mod(d * y2 + 1n, p), p - 2n, p), p);
  let x = modPow(x2, (p + 3n) / 8n, p);
  if ((x * x) % p !== x2) {
    const sqrtMinusOne = modPow(2n, (p - 1n) / 4n, p);
    x = (x * sqrtMinusOne) % p;
  }
  if ((x * x) % p !== x2) return false;
  return !(x === 0n && sign === 1);
}
async function deriveAssociatedTokenAddress(owner: string, mint: string, tokenProgram: string): Promise<string> {
  const ownerBytes = bs58.decode(owner);
  const mintBytes = bs58.decode(mint);
  const tokenProgramBytes = bs58.decode(tokenProgram);
  const associatedProgramBytes = bs58.decode(SOL_ASSOCIATED_TOKEN_PROGRAM);
  const marker = Buffer.from('ProgramDerivedAddress', 'utf8');
  for (let bump = 255; bump >= 0; bump -= 1) {
    const digest = sha256(Uint8Array.from([
      ...ownerBytes, ...tokenProgramBytes, ...mintBytes, bump, ...associatedProgramBytes, ...marker,
    ]));
    if (!isEd25519Point(digest)) return bs58.encode(digest);
  }
  throw new Error('Unable to derive the recipient token account.');
}
function compileSolanaMessage(payer: string, blockhash: string, instructions: SolanaInstruction[]): Uint8Array {
  const accounts = new Map<string, { isSigner: boolean; isWritable: boolean }>();
  accounts.set(payer, { isSigner: true, isWritable: true });
  for (const instruction of instructions) {
    for (const key of instruction.keys) {
      const previous = accounts.get(key.pubkey);
      accounts.set(key.pubkey, {
        isSigner: Boolean(previous?.isSigner || key.isSigner),
        isWritable: Boolean(previous?.isWritable || key.isWritable),
      });
    }
    if (!accounts.has(instruction.programId)) accounts.set(instruction.programId, { isSigner: false, isWritable: false });
  }
  const rest = [...accounts.entries()].filter(([key]) => key !== payer);
  rest.sort((a, b) => Number(b[1].isSigner) - Number(a[1].isSigner) || Number(b[1].isWritable) - Number(a[1].isWritable));
  const ordered = [payer, ...rest.map(([key]) => key)];
  if (ordered.length > 256) throw new Error('Solana transaction contains too many accounts.');
  const indexes = new Map(ordered.map((key, index) => [key, index]));
  const readonlyUnsigned = ordered.filter((key) => {
    const meta = accounts.get(key)!;
    return !meta.isSigner && !meta.isWritable;
  }).length;
  const compiled = instructions.map((instruction) => {
    const programIndex = indexes.get(instruction.programId);
    if (programIndex === undefined) throw new Error('Invalid Solana instruction program.');
    const accountIndexes = instruction.keys.map((key) => {
      const index = indexes.get(key.pubkey);
      if (index === undefined) throw new Error('Invalid Solana instruction account.');
      return index;
    });
    return [
      programIndex,
      ...shortvec(accountIndexes.length), ...accountIndexes,
      ...shortvec(instruction.data.length), ...instruction.data,
    ];
  });
  return Uint8Array.from([
    1, 0, readonlyUnsigned,
    ...shortvec(ordered.length),
    ...ordered.flatMap((key) => [...bs58.decode(key)]),
    ...bs58.decode(blockhash),
    ...shortvec(compiled.length),
    ...compiled.flat(),
  ]);
}
async function solRpc<T>(network: 'mainnet' | 'testnet', method: string, params: unknown[] = []): Promise<T> {
  return serverRpcRequest<T>('solana', network, method, params);
}
const formatAmount = (value: string, decimals: number) => {
  try { return ethers.formatUnits(BigInt(value), decimals); } catch { return '0'; }
};
const cleanAmount = (value: string) => /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && /[1-9]/.test(value);

type Review = {
  to: string;
  amount: string;
  fee: string;
  feeSymbol: string;
  network: string;
  assetName: string;
  assetSymbol: string;
  isNative: boolean;
  evmTx?: ethers.TransactionRequest;
  solMessage?: Uint8Array;
  blockhash?: string;
  lastValidBlockHeight?: number;
  rent?: string;
};

export default function Send() {
  const router = useRouter();
  const { selectedBlockchain, network, walletAddresses, isLocked, activeWallet, tokens } = useWallet();
  const address = walletAddresses?.[selectedBlockchain] || '';
  const symbol = SYMBOL[selectedBlockchain];
  const testnet = network === 'testnet';
  const rpc = useMemo(() => selectedBlockchain === 'solana' ? null : { chainId: getCentralEvmChainId(selectedBlockchain, network) }, [selectedBlockchain, network]);
  const nativeAsset: Token = useMemo(() => ({
    id: selectedBlockchain === 'polygon' ? 'matic' : selectedBlockchain === 'solana' ? 'sol' : selectedBlockchain === 'bnb' ? 'bnb' : 'eth',
    name: LABEL[selectedBlockchain],
    symbol,
    balance: 0,
    balanceUSD: 0,
    blockchain: selectedBlockchain,
  }), [selectedBlockchain, symbol]);
  const chainAssets = useMemo(() => [
    nativeAsset,
    ...tokens.filter((token) => token.blockchain === selectedBlockchain && Boolean(token.contractAddress)),
  ], [nativeAsset, tokens, selectedBlockchain]);
  const [selectedAsset, setSelectedAsset] = useState<Token>(nativeAsset);
  const [assetPickerVisible, setAssetPickerVisible] = useState(false);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [hash, setHash] = useState('');
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSelectedAsset(nativeAsset);
    setAmount('');
    setReview(null);
    setError('');
  }, [nativeAsset]);

  const isNative = !selectedAsset.contractAddress;
  const decimals = isNative ? (selectedBlockchain === 'solana' ? 9 : 18) : (selectedAsset.decimals ?? 18);
  const assetSymbol = selectedAsset.symbol;

  const getMnemonicForOriginalWallet = async () => {
    if (!activeWallet || activeWallet.sourceType !== 'mnemonic') {
      throw new Error('Sending is currently enabled for the original recovery-phrase wallet only. Watch-only and imported-key wallets cannot sign yet.');
    }
    const mnemonic = await getMnemonic();
    if (!mnemonic) throw new Error('Wallet secret unavailable. Restore your original wallet.');
    const derived = await deriveAddresses(mnemonic);
    const activeAddress = activeWallet.addresses[selectedBlockchain];
    const derivedAddress = derived[selectedBlockchain];
    const matches = selectedBlockchain === 'solana'
      ? derivedAddress === activeAddress
      : Boolean(activeAddress && derivedAddress && derivedAddress.toLowerCase() === activeAddress.toLowerCase());
    if (!matches) throw new Error('This wallet uses a different recovery phrase. Multi-wallet signing will be added separately; select the original wallet for now.');
    return mnemonic;
  };

  const loadBalance = useCallback(async () => {
    if (!address || isLocked) { setBalance(null); return; }
    setLoadingBalance(true);
    setError('');
    try {
      if (!selectedAsset.contractAddress) {
        if (selectedBlockchain === 'solana') {
          const result = await solRpc<{ value: number }>(network, 'getBalance', [address, { commitment: 'confirmed' }]);
          setBalance(ethers.formatUnits(BigInt(result.value), 9));
        } else {
          const value = await serverRpcRequest<string>(selectedBlockchain, network, 'eth_getBalance', [address, 'latest']);
          setBalance(ethers.formatEther(BigInt(value)));
        }
      } else if (selectedBlockchain === 'solana') {
        const mint = selectedAsset.contractAddress;
        if (!mint) throw new Error('Token mint address is missing.');
        const [mintInfo, accounts] = await Promise.all([
          solRpc<any>(network, 'getAccountInfo', [mint, { encoding: 'base64', commitment: 'confirmed' }]),
          solRpc<any>(network, 'getTokenAccountsByOwner', [address, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]),
        ]);
        const ownerProgram = mintInfo?.value?.owner;
        if (![SOL_TOKEN_PROGRAM, SOL_TOKEN_2022_PROGRAM].includes(ownerProgram)) throw new Error('This mint is not a supported SPL token on the selected network.');
        const mintData = Buffer.from(mintInfo.value.data[0], 'base64');
        if (mintData.length < 82) throw new Error('The SPL token mint data is invalid.');
        const onChainDecimals = mintData[44];
        if (onChainDecimals > 36) throw new Error('The SPL token has unsupported decimals.');
        setSelectedAsset((current) => current.id === selectedAsset.id && current.decimals !== onChainDecimals
          ? { ...current, decimals: onChainDecimals }
          : current);
        const rawBalance = (accounts?.value ?? []).reduce((sum: bigint, item: any) => {
          const raw = item?.account?.data?.parsed?.info?.tokenAmount?.amount;
          return sum + (raw ? BigInt(raw) : 0n);
        }, 0n);
        setBalance(ethers.formatUnits(rawBalance, onChainDecimals));
      } else {
        const iface = new ethers.Interface(TOKEN_ABI);
        const decimalsIface = new ethers.Interface(['function decimals() view returns (uint8)']);
        const [raw, decimalsRaw] = await Promise.all([
          serverRpcRequest<string>(selectedBlockchain, network, 'eth_call', [{
            to: selectedAsset.contractAddress,
            data: iface.encodeFunctionData('balanceOf', [address]),
          }, 'latest']),
          serverRpcRequest<string>(selectedBlockchain, network, 'eth_call', [{
            to: selectedAsset.contractAddress,
            data: decimalsIface.encodeFunctionData('decimals', []),
          }, 'latest']),
        ]);
        const [rawBalance] = iface.decodeFunctionResult('balanceOf', raw);
        const [onChainDecimals] = decimalsIface.decodeFunctionResult('decimals', decimalsRaw);
        const resolvedDecimals = Number(onChainDecimals);
        if (!Number.isInteger(resolvedDecimals) || resolvedDecimals < 0 || resolvedDecimals > 36) throw new Error('Token contract returned invalid decimals.');
        setSelectedAsset((current) => current.id === selectedAsset.id && current.decimals !== resolvedDecimals ? { ...current, decimals: resolvedDecimals } : current);
        setBalance(formatAmount(rawBalance.toString(), resolvedDecimals));
      }
    } catch (e: any) {
      setBalance(null);
      setError(e?.message || 'Unable to load this asset balance.');
    } finally {
      setLoadingBalance(false);
    }
  }, [address, isLocked, selectedAsset, selectedBlockchain, network, decimals]);

  useEffect(() => {
    setReview(null);
    setError('');
    setBalance(null);
    void loadBalance();
  }, [loadBalance]);

  const chooseAsset = (asset: Token) => {
    if (asset.blockchain !== selectedBlockchain) return;
    setSelectedAsset(asset);
    setAssetPickerVisible(false);
    setAmount('');
    setReview(null);
    setError('');
  };

  const prepare = async () => {
    setError('');
    if (isLocked) { setError('Unlock your wallet before sending.'); return; }
    if (!address) { setError('No wallet address is available for the selected blockchain.'); return; }
    if (!to.trim()) { setError('Enter a recipient address.'); return; }
    if (!cleanAmount(amount)) { setError('Enter a valid amount greater than zero.'); return; }
    setPreparing(true);
    try {
      await getMnemonicForOriginalWallet();
      if (selectedBlockchain === 'solana') {
        const recipientBytes = bs58.decode(to.trim());
        if (recipientBytes.length !== 32) throw new Error('Enter a valid Solana address.');
        if (to.trim() === address) throw new Error('Recipient must be different from your own address.');

        const [latest, currentBalance] = await Promise.all([
          solRpc<any>(network, 'getLatestBlockhash', [{ commitment: 'confirmed' }]),
          solRpc<any>(network, 'getBalance', [address, { commitment: 'confirmed' }]),
        ]);
        if (!latest?.value?.blockhash || latest.value.lastValidBlockHeight === undefined) throw new Error('Solana did not return a valid recent blockhash.');
        const instructions: SolanaInstruction[] = [];
        let transferUnits: bigint;
        let rentReserve = 0n;

        if (isNative) {
          transferUnits = ethers.parseUnits(amount, 9);
          instructions.push({
            programId: SOL_SYSTEM_PROGRAM,
            keys: [
              { pubkey: address, isSigner: true, isWritable: true },
              { pubkey: to.trim(), isSigner: false, isWritable: true },
            ],
            data: [...u32(2), ...u64(transferUnits)],
          });
        } else {
          const mint = selectedAsset.contractAddress;
          if (!mint) throw new Error('Token mint address is missing.');
          const mintInfo = await solRpc<any>(network, 'getAccountInfo', [mint, { encoding: 'base64', commitment: 'confirmed' }]);
          if (!mintInfo?.value) throw new Error('SPL token mint was not found on the selected network.');
          const tokenProgram = mintInfo.value.owner as string;
          if (![SOL_TOKEN_PROGRAM, SOL_TOKEN_2022_PROGRAM].includes(tokenProgram)) throw new Error('This mint is not owned by a supported Solana token program.');
          const mintData = Buffer.from(mintInfo.value.data[0], 'base64');
          if (mintData.length < 82) throw new Error('The SPL token mint data is invalid.');
          const tokenDecimals = mintData[44];
          if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 36) throw new Error('The SPL token has unsupported decimals.');
          transferUnits = ethers.parseUnits(amount, tokenDecimals);

          const sourceAccounts = await solRpc<any>(network, 'getTokenAccountsByOwner', [
            address, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' },
          ]);
          const availableAccounts = (sourceAccounts?.value ?? []).map((item: any) => ({
            address: String(item.pubkey),
            amount: BigInt(item?.account?.data?.parsed?.info?.tokenAmount?.amount ?? '0'),
          }));
          const source = availableAccounts.find((item: { address: string; amount: bigint }) => item.amount >= transferUnits);
          if (!source) {
            const total = availableAccounts.reduce((sum: bigint, item: { address: string; amount: bigint }) => sum + item.amount, 0n);
            throw new Error(total >= transferUnits
              ? 'This balance is spread across multiple token accounts. Consolidate the SPL token accounts before sending.'
              : 'Insufficient ' + assetSymbol + ' balance.');
          }

          const recipientTokenAccount = await deriveAssociatedTokenAddress(to.trim(), mint, tokenProgram);
          const destinationInfo = await solRpc<any>(network, 'getAccountInfo', [
            recipientTokenAccount, { encoding: 'base64', commitment: 'confirmed' },
          ]);
          if (!destinationInfo?.value) {
            instructions.push({
              programId: SOL_ASSOCIATED_TOKEN_PROGRAM,
              keys: [
                { pubkey: address, isSigner: true, isWritable: true },
                { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
                { pubkey: to.trim(), isSigner: false, isWritable: false },
                { pubkey: mint, isSigner: false, isWritable: false },
                { pubkey: SOL_SYSTEM_PROGRAM, isSigner: false, isWritable: false },
                { pubkey: tokenProgram, isSigner: false, isWritable: false },
              ],
              data: [1],
            });
            const rentLamports = await solRpc<number>(network, 'getMinimumBalanceForRentExemption', [165, { commitment: 'confirmed' }]);
            rentReserve = BigInt(rentLamports);
            if (tokenProgram === SOL_TOKEN_2022_PROGRAM) rentReserve += 1_000_000n;
          } else if (destinationInfo.value.owner !== tokenProgram) {
            throw new Error('Recipient token account has an unexpected owner program.');
          }

          instructions.push({
            programId: tokenProgram,
            keys: [
              { pubkey: source.address, isSigner: false, isWritable: true },
              { pubkey: mint, isSigner: false, isWritable: false },
              { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
              { pubkey: address, isSigner: true, isWritable: false },
            ],
            data: [12, ...u64(transferUnits), tokenDecimals],
          });
        }

        const message = compileSolanaMessage(address, latest.value.blockhash, instructions);
        const feeResult = await solRpc<any>(network, 'getFeeForMessage', [
          Buffer.from(message).toString('base64'),
          { commitment: 'confirmed', encoding: 'base64' },
        ]);
        if (feeResult.value === null || feeResult.value === undefined) throw new Error('Unable to estimate Solana network fee.');
        const fee = BigInt(feeResult.value);
        const nativeBalance = BigInt(currentBalance.value);
        const requiredLamports = fee + rentReserve + (isNative ? transferUnits : 0n);
        if (requiredLamports > nativeBalance) {
          throw new Error(isNative
            ? 'Insufficient SOL for the transfer amount and network fee.'
            : rentReserve > 0n
              ? 'Insufficient SOL to pay the network fee and create the recipient token account.'
              : 'Insufficient SOL to pay the network fee.');
        }
        setReview({
          to: to.trim(), amount, fee: ethers.formatUnits(fee, 9), feeSymbol: 'SOL',
          network: testnet ? 'Solana Devnet' : 'Solana Mainnet',
          assetName: selectedAsset.name, assetSymbol, isNative,
          solMessage: message, blockhash: latest.value.blockhash,
          lastValidBlockHeight: latest.value.lastValidBlockHeight,
          rent: rentReserve > 0n ? ethers.formatUnits(rentReserve, 9) : undefined,
        });
      } else {
        if (!ethers.isAddress(to.trim())) throw new Error('Enter a valid EVM wallet address.');
        const recipient = ethers.getAddress(to.trim());
        if (recipient.toLowerCase() === address.toLowerCase()) throw new Error('Recipient must be different from your own address.');
        if (!rpc) throw new Error('Unsupported network.');
        const [nativeBalanceHex, gasPriceHex, nonceHex, actualChainId] = await Promise.all([
          serverRpcRequest<string>(selectedBlockchain, network, 'eth_getBalance', [address, 'latest']),
          serverRpcRequest<string>(selectedBlockchain, network, 'eth_gasPrice', []),
          serverRpcRequest<string>(selectedBlockchain, network, 'eth_getTransactionCount', [address, 'pending']),
          serverRpcRequest<string>(selectedBlockchain, network, 'eth_chainId', []),
        ]);
        if (Number(BigInt(actualChainId)) !== rpc.chainId) throw new Error('RPC network mismatch. Transaction cancelled.');
        const gasPrice = BigInt(gasPriceHex);
        const value = isNative ? ethers.parseEther(amount) : 0n;
        let tx: ethers.TransactionRequest;
        let gasEstimateHex: string;
        if (isNative) {
          tx = { to: recipient, value };
          gasEstimateHex = await serverRpcRequest<string>(selectedBlockchain, network, 'eth_estimateGas', [{
            from: address, to: recipient, value: ethers.toQuantity(value),
          }]);
        } else {
          if (!selectedAsset.contractAddress || !ethers.isAddress(selectedAsset.contractAddress)) throw new Error('This token has an invalid contract address.');
          const iface = new ethers.Interface(TOKEN_ABI);
          const decimalsIface = new ethers.Interface(['function decimals() view returns (uint8)']);
          const decimalsRaw = await serverRpcRequest<string>(selectedBlockchain, network, 'eth_call', [{
            to: selectedAsset.contractAddress,
            data: decimalsIface.encodeFunctionData('decimals', []),
          }, 'latest']);
          const [onChainDecimals] = decimalsIface.decodeFunctionResult('decimals', decimalsRaw);
          const tokenDecimals = Number(onChainDecimals);
          if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 36) throw new Error('Token contract returned invalid decimals.');
          const data = iface.encodeFunctionData('transfer', [recipient, ethers.parseUnits(amount, tokenDecimals)]);
          tx = { to: ethers.getAddress(selectedAsset.contractAddress), value: 0n, data };
          gasEstimateHex = await serverRpcRequest<string>(selectedBlockchain, network, 'eth_estimateGas', [{
            from: address, to: tx.to, value: '0x0', data,
          }]);
        }
        const estimate = BigInt(gasEstimateHex);
        const gasLimit = estimate + (estimate / 5n); // 20% execution headroom
        const fee = gasLimit * gasPrice;
        const nativeBalance = BigInt(nativeBalanceHex);
        if (value + fee > nativeBalance) throw new Error('Insufficient native ' + symbol + ' to cover the transfer amount and network fee.');
        if (!isNative) {
          const iface = new ethers.Interface(TOKEN_ABI);
          const decimalsIface = new ethers.Interface(['function decimals() view returns (uint8)']);
          const [raw, decimalsRaw] = await Promise.all([
            serverRpcRequest<string>(selectedBlockchain, network, 'eth_call', [{
              to: selectedAsset.contractAddress,
              data: iface.encodeFunctionData('balanceOf', [address]),
            }, 'latest']),
            serverRpcRequest<string>(selectedBlockchain, network, 'eth_call', [{
              to: selectedAsset.contractAddress,
              data: decimalsIface.encodeFunctionData('decimals', []),
            }, 'latest']),
          ]);
          const [rawBalance] = iface.decodeFunctionResult('balanceOf', raw);
          const [onChainDecimals] = decimalsIface.decodeFunctionResult('decimals', decimalsRaw);
          const tokenDecimals = Number(onChainDecimals);
          if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 36) throw new Error('Token contract returned invalid decimals.');
          if (ethers.parseUnits(amount, tokenDecimals) > BigInt(rawBalance)) throw new Error('Insufficient ' + assetSymbol + ' balance.');
        }
        tx = {
          ...tx,
          gasLimit,
          gasPrice,
          nonce: Number(BigInt(nonceHex)),
          chainId: rpc.chainId,
        };
        const netName = testnet
          ? (selectedBlockchain === 'ethereum' ? 'Sepolia' : selectedBlockchain === 'bnb' ? 'BNB Testnet' : 'Polygon Amoy')
          : LABEL[selectedBlockchain] + ' Mainnet';
        setReview({
          to: recipient, amount, fee: ethers.formatEther(fee), feeSymbol: symbol,
          network: netName, assetName: selectedAsset.name, assetSymbol, isNative,
          evmTx: tx,
        });
      }
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'Unable to prepare transaction.');
      setReview(null);
    } finally {
      setPreparing(false);
    }
  };

  const send = async () => {
    if (!review || sending) return;
    setSending(true);
    setError('');
    let submittedHash = '';
    try {
      const mnemonic = await getMnemonicForOriginalWallet();
      let txHash = '';
      if (selectedBlockchain === 'solana') {
        if (!review.solMessage || !review.blockhash || review.lastValidBlockHeight === undefined) throw new Error('Transaction review expired. Review again.');
        const [currentBlockHeight, actualWalletAddress] = await Promise.all([
          solRpc<number>(network, 'getBlockHeight', [{ commitment: 'confirmed' }]),
          Promise.resolve((await deriveAddresses(mnemonic)).solana),
        ]);
        if (actualWalletAddress !== address) throw new Error('Signing account does not match the active Solana address.');
        if (currentBlockHeight > review.lastValidBlockHeight) throw new Error('Solana transaction review expired. Please review the transfer again.');
        const signature = await signSolanaMessage(review.solMessage);
        if (signature.length !== 64) throw new Error('The wallet returned an invalid Solana signature.');
        const expectedSignature = bs58.encode(Uint8Array.from(signature));
        const raw = Uint8Array.from([...shortvec(1), ...signature, ...review.solMessage]);
        txHash = await solRpc<string>(network, 'sendTransaction', [
          Buffer.from(raw).toString('base64'),
          { encoding: 'base64', preflightCommitment: 'confirmed', skipPreflight: false },
        ]);
        if (!txHash || txHash.length < 80 || txHash !== expectedSignature) throw new Error('Solana RPC returned a signature that does not match the signed transaction.');
        submittedHash = txHash;
        let confirmed = false;
        for (let attempt = 0; attempt < 25; attempt++) {
          const status = await solRpc<any>(network, 'getSignatureStatuses', [[txHash], { searchTransactionHistory: true }]);
          const value = status.value?.[0];
          if (value?.err) throw new Error('Solana transaction failed on chain.');
          if (value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized') { confirmed = true; break; }
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
        setPendingConfirmation(!confirmed);
      } else {
        if (!rpc || !review.evmTx) throw new Error('Transaction review expired. Review again.');
        const [actualChainId, currentNonce] = await Promise.all([
          serverRpcRequest<string>(selectedBlockchain, network, 'eth_chainId', []),
          serverRpcRequest<string>(selectedBlockchain, network, 'eth_getTransactionCount', [address, 'pending']),
        ]);
        if (Number(BigInt(actualChainId)) !== rpc.chainId) throw new Error('Network changed. Transaction cancelled.');
        if (Number(BigInt(currentNonce)) !== Number(review.evmTx.nonce)) throw new Error('Wallet nonce changed during review. Please review the transaction again.');
        const signer = ethers.HDNodeWallet.fromPhrase(mnemonic);
        if (signer.address.toLowerCase() !== address.toLowerCase()) throw new Error('Signing account does not match the original wallet address.');
        const signed = await signer.signTransaction(review.evmTx);
        txHash = await serverRpcRequest<string>(selectedBlockchain, network, 'eth_sendRawTransaction', [signed]);
        if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) throw new Error('RPC returned an invalid transaction hash.');
        if (txHash.toLowerCase() !== ethers.keccak256(signed).toLowerCase()) throw new Error('RPC transaction hash did not match the signed transaction.');
        submittedHash = txHash;
        let confirmed = false;
        for (let attempt = 0; attempt < 30; attempt++) {
          const receipt = await serverRpcRequest<any>(selectedBlockchain, network, 'eth_getTransactionReceipt', [txHash]);
          if (receipt) {
            if (receipt.status === '0x0') throw new Error('Transaction reverted on chain. The token contract may have rejected the transfer.');
            if (receipt.status === '0x1') { confirmed = true; break; }
          }
          await new Promise((resolve) => setTimeout(resolve, 1800));
        }
        setPendingConfirmation(!confirmed);
      }
      setHash(txHash);
      setReview(null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void loadBalance();
    } catch (e: any) {
      if (submittedHash) {
        setHash(submittedHash);
        setPendingConfirmation(true);
        setReview(null);
        setError('Transaction was submitted, but confirmation could not be verified. Check the transaction hash before trying again.');
      } else {
        setError(e?.shortMessage || e?.message || 'Transaction failed.');
      }
    } finally {
      setSending(false);
    }
  };

  const maxAmount = () => {
    if (!balance) return;
    try {
      if (!isNative) {
        setAmount(balance);
        setReview(null);
        return;
      }
      // Reserve a small amount for the network fee without converting balances
      // through JavaScript Number (which loses precision for crypto amounts).
      const reserve = selectedBlockchain === 'solana'
        ? '0.00001'
        : selectedBlockchain === 'ethereum'
          ? '0.001'
          : selectedBlockchain === 'bnb'
            ? '0.0005'
            : '0.05';
      const available = ethers.parseUnits(balance, decimals);
      const feeReserve = ethers.parseUnits(reserve, decimals);
      const max = available > feeReserve ? available - feeReserve : 0n;
      setAmount(max > 0n ? ethers.formatUnits(max, decimals).replace(/\.0$/, '') : '');
      setReview(null);
    } catch {
      setError('Unable to calculate the maximum transferable amount.');
    }
  };

  if (hash) return (
    <SafeAreaView style={s.container}>
      <View style={s.success}>
        <View style={s.successIcon}><Ionicons name="checkmark" size={38} color="#FFFFFF" /></View>
        <Text style={s.title}>{pendingConfirmation ? 'Transaction submitted' : 'Transaction confirmed'}</Text>
        <Text style={s.sub}>{pendingConfirmation ? 'Confirmation is still pending. Check this transaction hash before attempting another transfer.' : 'The network has confirmed your transfer.'}</Text>
        <Text selectable style={s.hash}>{hash}</Text>
        <TouchableOpacity style={s.primary} onPress={() => router.replace('/(tabs)/home')}><Text style={s.primaryText}>Back to wallet</Text></TouchableOpacity>
        <TouchableOpacity style={s.secondary} onPress={() => { setHash(''); setPendingConfirmation(false); setTo(''); setAmount(''); setReview(null); }}><Text style={s.secondaryText}>Send another</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}><Ionicons name="arrow-back" size={22} color="#211B35" /></TouchableOpacity>
          <Text style={s.headerTitle}>Send</Text><View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.eyebrow}>TRANSFER ASSETS</Text>
          <Text style={s.title}>Send crypto</Text>
          <Text style={s.sub}>Send on {LABEL[selectedBlockchain]} only. The network is inherited from your wallet.</Text>

          <Text style={s.label}>Asset to send</Text>
          <TouchableOpacity style={s.assetSelector} onPress={() => setAssetPickerVisible(true)} disabled={preparing || sending}>
            <View style={s.assetIcon}><Ionicons name={isNative ? 'diamond-outline' : 'pricetag-outline'} size={20} color="#6C4CF1" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.assetName}>{selectedAsset.name}</Text>
              <Text style={s.assetSub}>{assetSymbol} · {isNative ? 'Native asset' : 'Imported token'}</Text>
            </View>
            <Ionicons name="chevron-down" size={19} color="#6C4CF1" />
          </TouchableOpacity>

          <View style={s.balanceCard}>
            <Ionicons name="wallet-outline" size={16} color="#6C4CF1" />
            <Text style={s.balanceLabel}>{testnet ? 'Testnet' : 'Mainnet'} · {LABEL[selectedBlockchain]}</Text>
            <View style={{ flex: 1 }} />
            <Text style={s.balanceValue}>{loadingBalance ? 'Loading…' : balance === null ? '—' : Number(balance).toLocaleString(undefined, { maximumFractionDigits: 8 }) + ' ' + assetSymbol}</Text>
          </View>

          <Text style={s.label}>Recipient address</Text>
          <View style={s.inputCard}>
            <TextInput value={to} onChangeText={(v) => { setTo(v); setReview(null); }} placeholder={selectedBlockchain === 'solana' ? 'Solana address' : '0x recipient address'} placeholderTextColor="#A09AAC" autoCapitalize="none" autoCorrect={false} style={s.input} />
            <TouchableOpacity onPress={() => { setTo(''); setReview(null); }}><Ionicons name="close-circle" size={19} color="#9A95A8" /></TouchableOpacity>
          </View>

          <Text style={s.label}>Amount</Text>
          <View style={s.amountCard}>
            <TextInput value={amount} onChangeText={(v) => { setAmount(v.replace(/[^0-9.]/g, '')); setReview(null); }} placeholder="0.00" placeholderTextColor="#A09AAC" keyboardType="decimal-pad" style={s.amountInput} />
            <Text style={s.symbol}>{assetSymbol}</Text>
            <TouchableOpacity style={s.max} onPress={maxAmount}><Text style={s.maxText}>MAX</Text></TouchableOpacity>
          </View>
          <Text style={s.helper}>Available: {balance === null ? '—' : Number(balance).toLocaleString(undefined, { maximumFractionDigits: 8 }) + ' ' + assetSymbol}{!isNative ? ' · Network fee is paid in ' + symbol : ''}</Text>

          {error ? <View style={s.error}><Ionicons name="alert-circle-outline" size={17} color="#B42318" /><Text style={s.errorText}>{error}</Text></View> : null}

          {review ? (
            <View style={s.review}>
              <Text style={s.reviewTitle}>Review transaction</Text>
              <View style={s.row}><Text style={s.muted}>You send</Text><Text style={s.value}>{review.amount} {review.assetSymbol}</Text></View>
              <View style={s.row}><Text style={s.muted}>Network</Text><Text style={s.value}>{review.network}</Text></View>
              <View style={s.row}><Text style={s.muted}>Network fee</Text><Text style={s.value}>{Number(review.fee).toFixed(8)} {review.feeSymbol}</Text></View>
              {review.rent ? <View style={s.row}><Text style={s.muted}>Recipient token account rent</Text><Text style={s.value}>{Number(review.rent).toFixed(8)} SOL</Text></View> : null}
              <Text style={s.muted}>Recipient</Text><Text selectable style={s.recipient}>{review.to}</Text>
              <Text style={s.warning}>Verify the recipient, asset and network. Blockchain transfers are generally irreversible.</Text>
              <TouchableOpacity style={[s.primary, sending && s.disabled]} disabled={sending} onPress={send}>
                {sending ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="lock-closed-outline" size={18} color="#FFFFFF" />}
                <Text style={s.primaryText}>{sending ? 'Broadcasting…' : 'Confirm & send'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondary} disabled={sending} onPress={() => setReview(null)}><Text style={s.secondaryText}>Cancel</Text></TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
        {!review && (
          <View style={s.footer}>
            <TouchableOpacity style={[s.primary, (preparing || loadingBalance || isLocked || !address) && s.disabled]} disabled={preparing || loadingBalance || isLocked || !address} onPress={prepare}>
              {preparing ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="arrow-up" size={19} color="#FFFFFF" />}
              <Text style={s.primaryText}>{preparing ? 'Preparing…' : 'Review transaction'}</Text>
            </TouchableOpacity>
          </View>
        )}
        <Modal visible={assetPickerVisible} transparent animationType="slide" onRequestClose={() => setAssetPickerVisible(false)}>
          <View style={s.modalOverlay}>
            <TouchableOpacity style={s.modalDismiss} activeOpacity={1} onPress={() => setAssetPickerVisible(false)} />
            <View style={s.modal}>
              <View style={s.modalHeader}>
                <View><Text style={s.modalTitle}>Select asset</Text><Text style={s.modalSub}>Only {LABEL[selectedBlockchain]} assets are shown</Text></View>
                <TouchableOpacity onPress={() => setAssetPickerVisible(false)} hitSlop={10}><Ionicons name="close" size={22} color="#777286" /></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 360 }}>
                {chainAssets.map((asset) => {
                  const active = selectedAsset.id === asset.id;
                  return (
                    <TouchableOpacity key={asset.id} style={[s.assetOption, active && s.assetOptionActive]} onPress={() => chooseAsset(asset)}>
                      <View style={s.assetIcon}><Ionicons name={asset.contractAddress ? 'pricetag-outline' : 'diamond-outline'} size={19} color="#6C4CF1" /></View>
                      <View style={{ flex: 1 }}><Text style={s.assetName}>{asset.name}</Text><Text style={s.assetSub}>{asset.symbol}{asset.contractAddress ? ' · Imported token' : ' · Native asset'}</Text></View>
                      {active ? <Ionicons name="checkmark-circle" size={20} color="#6C4CF1" /> : <Ionicons name="chevron-forward" size={17} color="#9B97A8" />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#EEEAF5' },
  back: { width: 40 }, headerTitle: { color: '#211B35', fontSize: 17, fontWeight: '800' },
  content: { padding: 20, paddingBottom: 30 },
  eyebrow: { color: '#6C4CF1', fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginTop: 8 },
  title: { color: '#211B35', fontSize: 27, fontWeight: '900', marginTop: 6 },
  sub: { color: '#777286', fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 20 },
  label: { color: '#555064', fontSize: 12, fontWeight: '800', marginBottom: 9, marginTop: 17 },
  assetSelector: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: '#E8E4F3', borderRadius: 15, backgroundColor: '#FFFFFF' },
  assetIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#F1EDFF', alignItems: 'center', justifyContent: 'center' },
  assetName: { color: '#211B35', fontSize: 13, fontWeight: '800' }, assetSub: { color: '#888296', fontSize: 11, marginTop: 4 },
  balanceCard: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#F7F5FC', borderRadius: 12, padding: 12, marginTop: 12 },
  balanceLabel: { color: '#625D70', fontSize: 11, fontWeight: '600' }, balanceValue: { color: '#211B35', fontSize: 11, fontWeight: '800' },
  inputCard: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E8E4F3', borderRadius: 14, paddingHorizontal: 14 },
  input: { flex: 1, color: '#211B35', fontSize: 13, paddingVertical: 15 },
  amountCard: { minHeight: 60, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E8E4F3', borderRadius: 14, paddingHorizontal: 14 },
  amountInput: { flex: 1, color: '#211B35', fontSize: 22, fontWeight: '800', paddingVertical: 12 },
  symbol: { color: '#777286', fontSize: 13, fontWeight: '800', marginRight: 12 },
  max: { backgroundColor: '#F1EDFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9 },
  maxText: { color: '#6C4CF1', fontSize: 11, fontWeight: '900' }, helper: { color: '#918B9F', fontSize: 11, marginTop: 7, lineHeight: 16 },
  error: { flexDirection: 'row', gap: 8, backgroundColor: '#FFF1F0', borderRadius: 12, padding: 12, marginTop: 16 },
  errorText: { flex: 1, color: '#B42318', fontSize: 12, lineHeight: 18 },
  review: { backgroundColor: '#FAF9FD', borderWidth: 1, borderColor: '#E8E4F3', borderRadius: 18, padding: 16, marginTop: 22 },
  reviewTitle: { color: '#211B35', fontSize: 17, fontWeight: '900', marginBottom: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  muted: { color: '#777286', fontSize: 12 }, value: { color: '#211B35', fontSize: 12, fontWeight: '800', textAlign: 'right' },
  recipient: { color: '#211B35', fontSize: 11, lineHeight: 17, marginTop: 6 },
  warning: { color: '#9A6700', backgroundColor: '#FFF7E6', padding: 11, borderRadius: 10, fontSize: 11, lineHeight: 16, marginVertical: 14 },
  footer: { padding: 20, paddingBottom: 26, borderTopWidth: 1, borderTopColor: '#EEEAF5' },
  primary: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#6C4CF1', borderRadius: 15, paddingHorizontal: 16 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' }, disabled: { opacity: 0.55 },
  secondary: { alignItems: 'center', paddingVertical: 13 }, secondaryText: { color: '#777286', fontSize: 13, fontWeight: '700' },
  success: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 26 },
  successIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#16A36A', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  hash: { color: '#6C4CF1', fontSize: 11, textAlign: 'center', marginVertical: 20, lineHeight: 17 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,16,38,0.42)' },
  modalDismiss: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  modal: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  modalTitle: { color: '#211B35', fontSize: 20, fontWeight: '900' }, modalSub: { color: '#777286', fontSize: 12, marginTop: 4 },
  assetOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 11, borderWidth: 1, borderColor: '#F0EDF7', borderRadius: 14, marginBottom: 8 },
  assetOptionActive: { backgroundColor: '#F8F6FF', borderColor: '#6C4CF1' }, comingSoon: { color: '#9A95A8', fontSize: 10, fontWeight: '800' },
});
