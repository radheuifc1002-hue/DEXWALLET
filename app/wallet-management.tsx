import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as bip39 from 'bip39';
import WalletAuthorizationModal from '../components/WalletAuthorizationModal';
import type { WalletAuthorization, WalletSensitiveAction } from '../mobile/services/walletSecurityService';
import { useWallet, type Blockchain } from '../context/WalletContext';
import { createWalletVault, addMnemonicSource, addDerivedAccounts, addWatchOnlyAccount, renameWalletAccount, removeWalletAccount } from '../mobile/services/walletVaultService';

type Mode = 'options' | 'import' | 'watch' | 'derive' | 'rename' | null;
const CHAIN_NAMES: Record<Blockchain, string> = { ethereum: 'Ethereum', bnb: 'BNB Chain', polygon: 'Polygon', solana: 'Solana' };
const short = (address?: string) => address ? address.slice(0, 8) + '…' + address.slice(-6) : '—';

export default function WalletManagement() {
  const router = useRouter();
  const { walletVaultStore, selectedBlockchain, selectWalletAccount, refreshWalletVaultStore } = useWallet();
  const [mode, setMode] = useState<Mode>(null);
  const [vaultId, setVaultId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [name, setName] = useState('');
  const [phrase, setPhrase] = useState('');
  const [publicAddress, setPublicAddress] = useState('');
  const [count, setCount] = useState('1');
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ vaultId: string; accountId: string } | null>(null);
  const [authorization, setAuthorization] = useState<{ action: WalletSensitiveAction; title: string; run: (auth: WalletAuthorization) => Promise<void> } | null>(null);
  const vaults = walletVaultStore?.vaults ?? [];
  const chainAccounts = useMemo(() => vaults.flatMap(vault => vault.accounts
    .filter(account => !!account.addresses[selectedBlockchain])
    .map(account => ({ vault, account }))), [vaults, selectedBlockchain]);
  const roots = chainAccounts.filter(item => item.account.sourceType === 'mnemonic' && item.account.accountIndex === 0);
  const derived = chainAccounts.filter(item => item.account.sourceType === 'mnemonic' && item.account.accountIndex !== 0);
  const others = chainAccounts.filter(item => item.account.sourceType !== 'mnemonic');
  const menuItem = chainAccounts.find(item => item.vault.id === menu?.vaultId && item.account.id === menu?.accountId);

  const open = (next: Mode, vId?: string, aId?: string) => {
    setVaultId(vId ?? vaults[0]?.id ?? '');
    setAccountId(aId ?? '');
    setName('');
    setPhrase('');
    setPublicAddress('');
    setCount('1');
    setMode(next);
  };
  const refreshAndClose = async () => {
    await refreshWalletVaultStore();
    setMode(null);
    setBusy(false);
    setPhrase('');
  };
  const runAuthorized = (action: WalletSensitiveAction, title: string, run: (auth: WalletAuthorization) => Promise<void>) => setAuthorization({ action, title, run });

  const submit = async (auth?: WalletAuthorization) => {
    if (busy) return;
    setBusy(true);
    try {
      if (mode === 'import') {
        const normalized = phrase.trim().toLowerCase().replace(/\\s+/g, ' ');
        if (normalized.split(' ').filter(Boolean).length !== 12 || !bip39.validateMnemonic(normalized)) {
          throw new Error('Enter a valid 12-word BIP39 recovery phrase.');
        }
        if (!auth) throw new Error('Authorization required.');
        let targetVaultId = vaultId;
        if (!targetVaultId) {
          const created = await createWalletVault('My Wallet');
          targetVaultId = created.vaults[created.vaults.length - 1].id;
        }
        await addMnemonicSource(targetVaultId, normalized, auth, 'Recovery Phrase', 'HD Wallet', [selectedBlockchain]);
      } else if (mode === 'watch') {
        let targetVaultId = vaultId;
        if (!targetVaultId) {
          const created = await createWalletVault('My Wallet');
          targetVaultId = created.vaults[created.vaults.length - 1].id;
        }
        await addWatchOnlyAccount(targetVaultId, { [selectedBlockchain]: publicAddress.trim() }, name.trim() || 'Watch Wallet');
      } else if (mode === 'derive') {
        const quantity = Number(count);
        if (!vaultId || !accountId) throw new Error('Select an HD wallet first.');
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('Choose 1–20 wallets.');
        if (!auth) throw new Error('Authorization required.');
        await addDerivedAccounts(vaultId, accountId, quantity, auth, name.trim() || 'Wallet', selectedBlockchain);
      } else if (mode === 'rename') {
        if (!vaultId || !accountId) throw new Error('Wallet not selected.');
        await renameWalletAccount(vaultId, accountId, name);
      }
      await refreshAndClose();
    } catch (error) {
      setBusy(false);
      Alert.alert('Unable to update wallets', error instanceof Error ? error.message : 'Please check the details and try again.');
    }
  };
  const onSubmit = () => {
    if (mode === 'import' || mode === 'derive') {
      runAuthorized(mode === 'derive' ? 'derive-account' : 'import-secret',
        mode === 'derive' ? 'Authorize wallet derivation' : 'Authorize recovery phrase import',
        async auth => { await submit(auth); setAuthorization(null); });
    } else void submit();
  };
  const activate = async (vId: string, aId: string) => {
    try {
      await selectWalletAccount(vId, aId);
      router.replace('/(tabs)/home');
    } catch (error) {
      Alert.alert('Wallet switch failed', error instanceof Error ? error.message : 'Please try again.');
    }
  };
  const remove = (vId: string, aId: string, label: string) => Alert.alert(
    'Remove ' + label + '?',
    'This removes the wallet entry from this device only. It does not affect on-chain funds. Make sure the recovery information is backed up.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => runAuthorized('delete-account', 'Authorize wallet removal', async auth => {
      await removeWalletAccount(vId, aId, auth);
      await refreshWalletVaultStore();
      setAuthorization(null);
    }) }]
  );
  const copy = async (value: string) => {
    await Clipboard.setStringAsync(value);
    setMenu(null);
    Alert.alert('Copied', 'Wallet address copied.');
  };

  const renderWallet = (item: typeof chainAccounts[number], isRoot = false) => {
    const { vault, account } = item;
    const address = account.addresses[selectedBlockchain] ?? '';
    const active = walletVaultStore?.activeAccountId === account.id;
    return <View key={account.id} style={[styles.walletCard, isRoot && styles.rootCard, active && styles.activeCard]}>
      <TouchableOpacity style={styles.walletBody} onPress={() => void activate(vault.id, account.id)} activeOpacity={0.8}>
        <View style={[styles.walletIcon, isRoot && styles.rootIcon, account.sourceType === 'watch-only' && styles.watchIcon]}>
          <Ionicons name={account.sourceType === 'watch-only' ? 'eye-outline' : isRoot ? 'key-outline' : 'wallet-outline'} size={20} color={account.sourceType === 'watch-only' ? '#0D9488' : isRoot ? '#D63384' : '#6C4CF1'} />
        </View>
        <View style={styles.walletCopy}>
          <View style={styles.walletNameRow}>
            <Text style={[styles.walletName, isRoot && styles.rootName]} numberOfLines={1}>{account.name}</Text>
            {isRoot ? <Text style={styles.badgePink}>HD</Text> : account.sourceType === 'watch-only' ? <Text style={styles.badgeGreen}>WATCH</Text> : null}
            {active ? <Ionicons name="checkmark-circle" size={17} color="#D63384" /> : null}
          </View>
          <Text style={styles.address}>{short(address)}</Text>
          <Text style={styles.walletMeta}>{account.sourceType === 'watch-only' ? 'Read-only address' : isRoot ? 'Recovery phrase wallet' : 'Derived wallet'}{account.derivationPaths[selectedBlockchain] ? ' · ' + account.derivationPaths[selectedBlockchain] : ''}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.more} onPress={() => setMenu({ vaultId: vault.id, accountId: account.id })} hitSlop={8}>
        <Ionicons name="ellipsis-vertical" size={20} color="#777286" />
      </TouchableOpacity>
    </View>;
  };

  return <SafeAreaView style={styles.screen} edges={['top']}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}><Ionicons name="chevron-back" size={21} color="#211B35" /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.title}>Manage Wallet</Text><Text style={styles.subtitle}>{CHAIN_NAMES[selectedBlockchain]} · {chainAccounts.length} wallet{chainAccounts.length === 1 ? '' : 's'}</Text></View>
      </View>

      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>HD Wallet</Text><Text style={styles.counter}>{roots.length}</Text></View>
      {roots.length ? roots.map(item => renderWallet(item, true)) : <View style={styles.empty}><Ionicons name="key-outline" size={23} color="#D63384" /><Text style={styles.emptyTitle}>No HD wallet on this chain</Text><Text style={styles.emptySubtitle}>Create or import a recovery phrase for {CHAIN_NAMES[selectedBlockchain]}.</Text></View>}

      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Derived Wallets</Text><Text style={styles.counter}>{derived.length}</Text></View>
      {derived.length ? derived.map(item => renderWallet(item)) : <Text style={styles.emptyLine}>No derived wallets yet.</Text>}

      {others.length ? <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Watch Wallets</Text><Text style={styles.counter}>{others.length}</Text></View>{others.map(item => renderWallet(item))}</> : null}

      <TouchableOpacity style={styles.addButton} onPress={() => open('options')} activeOpacity={0.82}><Ionicons name="add-circle-outline" size={20} color="#FFFFFF" /><Text style={styles.addButtonText}>Add Wallet</Text></TouchableOpacity>
      <TouchableOpacity style={styles.watchButton} onPress={() => open('watch')}><Ionicons name="eye-outline" size={19} color="#0D9488" /><Text style={styles.watchButtonText}>Add Watch Wallet</Text></TouchableOpacity>
      <View style={styles.note}><Ionicons name="shield-checkmark-outline" size={17} color="#0D9488" /><Text style={styles.noteText}>Recovery phrases and private keys remain in secure device storage. Watch wallets are read-only.</Text></View>
    </ScrollView>

    <Modal visible={mode !== null} transparent animationType="slide" onRequestClose={() => setMode(null)}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>{mode === 'options' ? 'Add Wallet' : mode === 'import' ? 'Import Wallet' : mode === 'watch' ? 'Add Watch Wallet' : mode === 'derive' ? 'Create Derived Wallets' : 'Rename Wallet'}</Text><TouchableOpacity onPress={() => setMode(null)}><Ionicons name="close" size={23} color="#777286" /></TouchableOpacity></View>
          {mode === 'options' ? <View style={{ gap: 10 }}>
            <TouchableOpacity style={styles.option} onPress={() => { setMode(null); router.push({ pathname: '/generate-seed', params: { chain: selectedBlockchain } }); }}><View style={styles.optionIcon}><Ionicons name="sparkles-outline" size={22} color="#D63384" /></View><View style={{ flex: 1 }}><Text style={styles.optionTitle}>Generate HD Wallet</Text><Text style={styles.optionDescription}>Create a new recovery phrase for {CHAIN_NAMES[selectedBlockchain]}.</Text></View><Ionicons name="chevron-forward" size={18} color="#D63384" /></TouchableOpacity>
            <TouchableOpacity style={styles.option} onPress={() => open('import')}><View style={[styles.optionIcon, { backgroundColor: '#F1EDFF' }]}><Ionicons name="key-outline" size={22} color="#6C4CF1" /></View><View style={{ flex: 1 }}><Text style={styles.optionTitle}>Import Wallet</Text><Text style={styles.optionDescription}>Import a 12-word phrase for this chain only.</Text></View><Ionicons name="chevron-forward" size={18} color="#6C4CF1" /></TouchableOpacity>
          </View> : null}
          {mode === 'import' ? <><Text style={styles.label}>12-word recovery phrase</Text><TextInput style={[styles.input, styles.phraseInput]} value={phrase} onChangeText={setPhrase} placeholder="Enter all 12 words" placeholderTextColor="#A39DB2" autoCapitalize="none" autoCorrect={false} multiline secureTextEntry /><Text style={styles.helper}>BIP39 checksum is validated locally. The phrase is imported only for {CHAIN_NAMES[selectedBlockchain]}.</Text></> : null}
          {mode === 'watch' ? <><Text style={styles.label}>{CHAIN_NAMES[selectedBlockchain]} public address</Text><TextInput style={styles.input} value={publicAddress} onChangeText={setPublicAddress} placeholder={selectedBlockchain === 'solana' ? 'Solana public address' : '0x public address'} placeholderTextColor="#A39DB2" autoCapitalize="none" autoCorrect={false} /><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Wallet name (optional)" placeholderTextColor="#A39DB2" autoCapitalize="words" /></> : null}
          {mode === 'derive' ? <><Text style={styles.label}>Number of wallets (1–20)</Text><TextInput style={styles.input} value={count} onChangeText={setCount} keyboardType="number-pad" placeholder="1" placeholderTextColor="#A39DB2" /><Text style={styles.label}>Wallet name prefix</Text><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Wallet" placeholderTextColor="#A39DB2" autoCapitalize="words" /></> : null}
          {mode === 'rename' ? <><Text style={styles.label}>Wallet name</Text><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Wallet name" placeholderTextColor="#A39DB2" autoCapitalize="words" /></> : null}
          {mode !== 'options' ? <TouchableOpacity style={[styles.submit, busy && { opacity: 0.6 }]} onPress={onSubmit} disabled={busy}><Text style={styles.submitText}>{busy ? 'Saving…' : mode === 'import' ? 'Import Wallet' : mode === 'watch' ? 'Add Watch Wallet' : mode === 'derive' ? 'Create Wallets' : 'Save Name'}</Text></TouchableOpacity> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>

    <Modal visible={menu !== null} transparent animationType="fade" onRequestClose={() => setMenu(null)}>
      <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setMenu(null)}>
        <View style={styles.menuCard}>
          <Text style={styles.menuTitle}>{menuItem?.account.name ?? 'Wallet actions'}</Text>
          {menuItem ? <TouchableOpacity style={styles.menuItem} onPress={() => void copy(menuItem.account.addresses[selectedBlockchain] ?? '')}><Ionicons name="copy-outline" size={18} color="#6C4CF1" /><Text style={styles.menuText}>Copy address</Text></TouchableOpacity> : null}
          {menuItem ? <TouchableOpacity style={styles.menuItem} onPress={() => { const item = menuItem; setMenu(null); open('rename', item.vault.id, item.account.id); setName(item.account.name); }}><Ionicons name="create-outline" size={18} color="#6C4CF1" /><Text style={styles.menuText}>Rename wallet</Text></TouchableOpacity> : null}
          {menuItem?.account.sourceType === 'mnemonic' && menuItem.account.accountIndex === 0 ? <TouchableOpacity style={styles.menuItem} onPress={() => { const item = menuItem; setMenu(null); void activate(item.vault.id, item.account.id).then(() => router.push('/export-seed')); }}><Ionicons name="key-outline" size={18} color="#D63384" /><Text style={styles.menuText}>Export recovery phrase</Text></TouchableOpacity> : null}
          {menuItem?.account.sourceType === 'mnemonic' && menuItem.account.accountIndex === 0 ? <TouchableOpacity style={styles.menuItem} onPress={() => { const item = menuItem; setMenu(null); runAuthorized('derive-account', 'Authorize derived wallet creation', async auth => { await addDerivedAccounts(item.vault.id, item.account.sourceId ?? '', 1, auth, 'Wallet', selectedBlockchain); await refreshWalletVaultStore(); setAuthorization(null); }); }}><Ionicons name="git-branch-outline" size={18} color="#D63384" /><Text style={styles.menuText}>Create derived wallet</Text></TouchableOpacity> : null}
          {menuItem?.account.sourceType === 'mnemonic' && menuItem.account.accountIndex !== 0 ? <TouchableOpacity style={styles.menuItem} onPress={() => { const item = menuItem; setMenu(null); void activate(item.vault.id, item.account.id).then(() => router.push('/export-private-key')); }}><Ionicons name="download-outline" size={18} color="#6C4CF1" /><Text style={styles.menuText}>Export private key</Text></TouchableOpacity> : null}
          {menuItem?.account.derivationPaths[selectedBlockchain] ? <View style={styles.pathBox}><Text style={styles.pathLabel}>Derivation path</Text><Text style={styles.pathText}>{menuItem.account.derivationPaths[selectedBlockchain]}</Text></View> : null}
          {menuItem ? <TouchableOpacity style={[styles.menuItem, styles.removeMenu]} onPress={() => { const item = menuItem; setMenu(null); remove(item.vault.id, item.account.id, item.account.name); }}><Ionicons name="trash-outline" size={18} color="#DC6262" /><Text style={[styles.menuText, { color: '#DC6262' }]}>Remove wallet</Text></TouchableOpacity> : null}
        </View>
      </TouchableOpacity>
    </Modal>
    <WalletAuthorizationModal visible={authorization !== null} action={authorization?.action ?? 'import-secret'} title={authorization?.title ?? 'Authorize wallet action'} onAuthorized={async auth => { await authorization?.run(auth); }} onCancel={() => setAuthorization(null)} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, content: { padding: 18, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }, back: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#F5F2FA', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 25, fontWeight: '900', color: '#211B35' }, subtitle: { fontSize: 12, color: '#777286', marginTop: 4 },
  chainBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 }, chainChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, backgroundColor: '#F5F2FA', borderWidth: 1, borderColor: '#EEE9F5' }, chainSelected: { backgroundColor: '#D63384', borderColor: '#D63384' }, chainText: { fontSize: 11, fontWeight: '800', color: '#777286' }, chainTextSelected: { color: '#FFFFFF' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 }, sectionTitle: { fontSize: 15, fontWeight: '900', color: '#211B35' }, counter: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: '#FCE7F3', color: '#B4236E', fontSize: 10, fontWeight: '900', overflow: 'hidden' },
  walletCard: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 13, borderRadius: 17, borderWidth: 1, borderColor: '#EEEAF4', backgroundColor: '#FFFFFF', marginBottom: 9 }, rootCard: { borderColor: '#F0B8D5', backgroundColor: '#FFF7FB' }, activeCard: { borderColor: '#D63384', borderWidth: 1.4 }, walletBody: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 }, walletIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F1EDFF', alignItems: 'center', justifyContent: 'center' }, rootIcon: { backgroundColor: '#FCE7F3' }, watchIcon: { backgroundColor: '#E6F7F4' }, walletCopy: { flex: 1, gap: 4 }, walletNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, walletName: { fontSize: 13, fontWeight: '800', color: '#211B35', flexShrink: 1 }, rootName: { color: '#B4236E' }, badgePink: { fontSize: 8, fontWeight: '900', color: '#B4236E', backgroundColor: '#FCE7F3', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 }, badgeGreen: { fontSize: 8, fontWeight: '900', color: '#0D9488', backgroundColor: '#E6F7F4', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 }, address: { fontSize: 10, color: '#777286', fontFamily: 'monospace' }, walletMeta: { fontSize: 9, color: '#9B95AA' }, more: { width: 34, height: 38, borderRadius: 10, backgroundColor: '#F8F6FB', alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', padding: 20, gap: 7, borderRadius: 16, borderWidth: 1, borderColor: '#F0D1E2', backgroundColor: '#FFF8FC', marginBottom: 16 }, emptyTitle: { fontSize: 13, fontWeight: '800', color: '#B4236E' }, emptySubtitle: { fontSize: 11, color: '#8D8498', textAlign: 'center', lineHeight: 16 }, emptyLine: { fontSize: 11, color: '#9B95AA', paddingVertical: 8, marginBottom: 10 },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 15, borderRadius: 15, backgroundColor: '#D63384', marginTop: 20 }, addButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' }, watchButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: '#CDEBE5', backgroundColor: '#F4FBF9', marginTop: 9 }, watchButtonText: { color: '#0D9488', fontSize: 13, fontWeight: '800' }, note: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13, backgroundColor: '#EAF8F4', borderRadius: 13, marginTop: 18 }, noteText: { flex: 1, fontSize: 11, color: '#387568', lineHeight: 16 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,16,38,0.45)' }, modalCard: { backgroundColor: '#FFFFFF', padding: 20, paddingBottom: 28, borderTopLeftRadius: 25, borderTopRightRadius: 25, gap: 13 }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }, modalTitle: { fontSize: 19, fontWeight: '900', color: '#211B35' }, option: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: '#EEE8F3', borderRadius: 16, padding: 13 }, optionIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#FCE7F3', alignItems: 'center', justifyContent: 'center' }, optionTitle: { fontSize: 13, fontWeight: '900', color: '#211B35' }, optionDescription: { fontSize: 10, color: '#777286', lineHeight: 15 },
  label: { fontSize: 12, fontWeight: '800', color: '#777286' }, input: { borderWidth: 1, borderColor: '#E8E4F3', borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, color: '#211B35', fontSize: 14, backgroundColor: '#FFFFFF' }, phraseInput: { minHeight: 84, textAlignVertical: 'top', lineHeight: 22 }, helper: { fontSize: 11, color: '#777286', lineHeight: 16 }, submit: { backgroundColor: '#D63384', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 4 }, submitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  menuBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(20,16,38,0.35)', padding: 22 }, menuCard: { width: '100%', borderRadius: 20, backgroundColor: '#FFFFFF', padding: 17, gap: 3 }, menuTitle: { fontSize: 15, fontWeight: '900', color: '#211B35', marginBottom: 8 }, menuItem: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, paddingHorizontal: 5 }, menuText: { fontSize: 13, fontWeight: '700', color: '#211B35' }, pathBox: { borderTopWidth: 1, borderTopColor: '#F0EDF7', paddingTop: 10, paddingBottom: 8 }, pathLabel: { fontSize: 10, color: '#777286', fontWeight: '800', marginBottom: 3 }, pathText: { fontSize: 11, color: '#6C4CF1', fontFamily: 'monospace' }, removeMenu: { borderTopWidth: 1, borderTopColor: '#F7E5E5', marginTop: 4 },
});
