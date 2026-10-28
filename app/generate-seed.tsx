import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { generateMnemonic } from '../mobile/services/walletService';
import { useWallet } from '../context/WalletContext';

export default function GenerateSeed() {
  const router = useRouter();
  const { setSeedPhrase } = useWallet();
  const [words, setWords] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const mnemonic = generateMnemonic();
    const w = mnemonic.split(' ');
    setWords(w);
    setSeedPhrase(w);
  }, []);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(words.join(' '));
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleContinue = () => {
    Alert.alert(
      'Did you save your seed phrase?',
      'Without it, you cannot recover your wallet if you lose access.',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Yes, I saved it',
          onPress: () => router.push('/confirm-seed'),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="key" size={40} color="#6C4CF1" />
        </View>
        <Text style={styles.title}>Your Seed Phrase</Text>
        <Text style={styles.subtitle}>
          Write these 12 words in order and store them safely. Never share them
          with anyone.
        </Text>

        {!revealed ? (
          <TouchableOpacity
            style={styles.revealBtn}
            onPress={() => setRevealed(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="eye-outline" size={20} color="#6C4CF1" />
            <Text style={styles.revealBtnText}>Tap to reveal</Text>
          </TouchableOpacity>
        ) : (
          <>
            <View style={styles.grid}>
              {words.map((w, i) => (
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

        <View style={styles.warning}>
          <Ionicons name="warning-outline" size={18} color="#F59E0B" />
          <Text style={styles.warningText}>
            If you lose this phrase, you lose your funds permanently.
          </Text>
        </View>

        {revealed && (
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={handleContinue}
            activeOpacity={0.85}
          >
            <Text style={styles.continueBtnText}>I've Written It Down</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0E17' },
  scroll: { padding: 24, alignItems: 'center', paddingBottom: 40 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1A1825',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#9B97B2',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
    maxWidth: 300,
  },
  revealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1A1825',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#6C4CF1',
    marginBottom: 24,
  },
  revealBtnText: {
    color: '#6C4CF1',
    fontSize: 16,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 16,
    width: '100%',
  },
  wordCard: {
    width: '30%',
    backgroundColor: '#1A1825',
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wordNum: {
    color: '#6C4CF1',
    fontSize: 11,
    fontWeight: '700',
    width: 18,
  },
  word: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  copyText: {
    color: '#9B97B2',
    fontSize: 14,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#1A1825',
    borderRadius: 12,
    padding: 14,
    marginBottom: 28,
    width: '100%',
    borderWidth: 1,
    borderColor: '#F59E0B44',
  },
  warningText: {
    color: '#F59E0B',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  continueBtn: {
    backgroundColor: '#6C4CF1',
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
