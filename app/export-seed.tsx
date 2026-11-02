import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '../context/WalletContext';
import { getMnemonicForSource } from '../mobile/services/walletVaultService';
import WalletAuthorizationModal from '../components/WalletAuthorizationModal';
import type { WalletAuthorization } from '../mobile/services/walletSecurityService';

export default function ExportSeed() {
  const router = useRouter();
  const { activeWallet } = useWallet();
  const [seedPhrase, setSeedPhrase] = useState<string[]>([]);
  const [step, setStep] = useState<'pin' | 'reveal'>('pin');
  const [authorizationVisible, setAuthorizationVisible] = useState(true);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleAuthorized = async (authorization: WalletAuthorization) => {
    try {
      if (!activeWallet?.sourceId || activeWallet.sourceType !== 'mnemonic') throw new Error('The selected account does not have a recovery phrase.');
      const phrase = await getMnemonicForSource(activeWallet.sourceId, authorization);
      if (!phrase) throw new Error('Recovery phrase is unavailable.');
      setSeedPhrase(phrase.split(' ')); setStep('reveal'); setAuthorizationVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to load recovery phrase.'); }
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(seedPhrase.join(' '));
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Export Seed Phrase</Text>
        <View style={{ width: 60 }} />
      </View>

      {step === 'pin' ? (
        <View style={styles.pinContent}>
          <Ionicons name="lock-closed" size={40} color="#6C4CF1" style={{ marginBottom: 16 }} />
          <Text style={styles.title}>Verify Your Identity</Text>
          <Text style={styles.subtitle}>Enter your PIN to view your seed phrase</Text>
          {error ? <Text style={styles.dangerText}>{error}</Text> : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.dangerBanner}>
            <Ionicons name="warning" size={20} color="#EF4444" />
            <Text style={styles.dangerText}>
              Never share your seed phrase. Anyone with it has full access to your funds.
            </Text>
          </View>

          {hidden ? (
            <TouchableOpacity
              style={styles.revealBtn}
              onPress={() => setHidden(false)}
            >
              <Ionicons name="eye-outline" size={20} color="#6C4CF1" />
              <Text style={styles.revealBtnText}>Tap to reveal</Text>
            </TouchableOpacity>
          ) : (
            <>
              <View style={styles.grid}>
                {seedPhrase.map((w, i) => (
                  <View key={i} style={styles.wordCard}>
                    <Text style={styles.wordNum}>{i + 1}</Text>
                    <Text style={styles.word}>{w}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
                <Ionicons
                  name={copied ? 'checkmark' : 'copy-outline'}
                  size={18}
                  color={copied ? '#10B981' : '#9B97B2'}
                />
                <Text style={[styles.copyText, copied && { color: '#10B981' }]}>
                  {copied ? 'Copied!' : 'Copy all words'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}
      <WalletAuthorizationModal visible={authorizationVisible && step==='pin'} action="export-secret" title="Verify to export recovery phrase" onCancel={()=>{setAuthorizationVisible(false);router.back();}} onAuthorized={handleAuthorized}/>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E4F3',
  },
  back: {},
  backText: { color: '#6C4CF1', fontSize: 16 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#211B35' },
  pinContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#211B35', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#777286', marginBottom: 32, textAlign: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  dangerBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#EF444422',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#EF444444',
  },
  dangerText: { color: '#EF4444', fontSize: 13, flex: 1, lineHeight: 18 },
  revealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#6C4CF1',
    alignSelf: 'center',
  },
  revealBtnText: { color: '#6C4CF1', fontSize: 16, fontWeight: '600' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 16,
  },
  wordCard: {
    width: '30%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wordNum: { color: '#6C4CF1', fontSize: 11, fontWeight: '700', width: 18 },
  word: { color: '#211B35', fontSize: 13, fontWeight: '600', flex: 1 },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    marginTop: 8,
  },
  copyText: { color: '#777286', fontSize: 14 },
});
