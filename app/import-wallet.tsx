import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { validateMnemonic } from '../mobile/services/walletService';

export default function ImportWallet() {
  const router = useRouter();
  const [mnemonic, setMnemonic] = useState('');
  const [error, setError] = useState('');

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    setMnemonic(text.trim());
    setError('');
  };

  const handleContinue = () => {
    const cleaned = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!validateMnemonic(cleaned)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError('Invalid seed phrase. Check for typos and try again.');
      return;
    }
    router.push({ pathname: '/set-pin', params: { mnemonic: cleaned } });
  };

  const wordCount = mnemonic.trim() ? mnemonic.trim().split(/\s+/).length : 0;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <Ionicons name="download-outline" size={36} color="#6C4CF1" />
          </View>

          <Text style={styles.title}>Import Wallet</Text>
          <Text style={styles.subtitle}>
            Enter your 12-word seed phrase separated by spaces.
          </Text>

          <View style={[styles.inputCard, error ? styles.inputCardError : null]}>
            <TextInput
              style={styles.input}
              value={mnemonic}
              onChangeText={(t) => {
                setMnemonic(t);
                setError('');
              }}
              placeholder="word1 word2 word3 …"
              placeholderTextColor="#4A4760"
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="done"
            />
          </View>

          <View style={styles.meta}>
            <Text style={styles.metaText}>{wordCount} / 12 words</Text>
            <TouchableOpacity onPress={handlePaste} style={styles.pasteBtn}>
              <Ionicons name="clipboard-outline" size={16} color="#6C4CF1" />
              <Text style={styles.pasteBtnText}>Paste</Text>
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.warning}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#6C4CF1" />
            <Text style={styles.warningText}>
              Your phrase stays on your device. We never store or transmit it.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.continueBtn, wordCount !== 12 && styles.continueBtnDisabled]}
            onPress={handleContinue}
            disabled={wordCount !== 12}
            activeOpacity={0.85}
          >
            <Text style={styles.continueBtnText}>Continue</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0E17' },
  scroll: { padding: 24, paddingBottom: 40 },
  back: { marginBottom: 20 },
  backText: { color: '#6C4CF1', fontSize: 16 },
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
  },
  subtitle: {
    fontSize: 14,
    color: '#9B97B2',
    lineHeight: 20,
    marginBottom: 24,
  },
  inputCard: {
    backgroundColor: '#1A1825',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#24223A',
    padding: 4,
    minHeight: 120,
  },
  inputCardError: {
    borderColor: '#EF4444',
  },
  input: {
    color: '#FFFFFF',
    fontSize: 16,
    padding: 12,
    lineHeight: 24,
    minHeight: 112,
    textAlignVertical: 'top',
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  metaText: { color: '#9B97B2', fontSize: 13 },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pasteBtnText: { color: '#6C4CF1', fontSize: 14, fontWeight: '600' },
  error: {
    color: '#EF4444',
    fontSize: 13,
    marginBottom: 12,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#1A1825',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#6C4CF144',
  },
  warningText: {
    color: '#9B97B2',
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
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
