import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '../context/WalletContext';

export default function ConfirmSeed() {
  const router = useRouter();
  const { seedPhrase } = useWallet();

  const testIndices = [2, 5, 8, 11];
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [shuffled] = useState(() => {
    // Always include the correct words for each test position
    const correct = testIndices.map((i) => seedPhrase[i]);
    // Fill remaining slots with random wrong words (those not in correct set)
    const wrong = seedPhrase.filter((w) => !correct.includes(w));
    for (let i = wrong.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
    }
    const pool = [...correct, ...wrong.slice(0, 4)];
    // Shuffle the pool so correct answers aren't always first
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  });
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);

  const handleSelect = (idx: number, word: string) => {
    const next = { ...selected };
    if (next[idx] === word) {
      delete next[idx];
    } else {
      next[idx] = word;
    }
    setSelected(next);
    setError('');
  };

  const handleVerify = () => {
    const allCorrect = testIndices.every(
      (i) => selected[i] === seedPhrase[i]
    );
    if (!allCorrect) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError('Some words are incorrect. Check and try again.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setVerified(true);
    setTimeout(() => router.push('/set-pin'), 600);
  };

  const allFilled = testIndices.every((i) => selected[i]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Verify Seed Phrase</Text>
        <Text style={styles.subtitle}>
          Select the correct word for each position to confirm you saved them.
        </Text>

        {testIndices.map((idx) => (
          <View key={idx} style={styles.questionBlock}>
            <Text style={styles.questionLabel}>Word #{idx + 1}</Text>
            <View style={styles.optionRow}>
              {shuffled.map((word) => {
                const isChosen = selected[idx] === word;
                const isCorrect = verified && seedPhrase[idx] === word;
                return (
                  <TouchableOpacity
                    key={word}
                    style={[
                      styles.option,
                      isChosen && styles.optionSelected,
                      isCorrect && styles.optionCorrect,
                    ]}
                    onPress={() => handleSelect(idx, word)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isChosen && styles.optionTextSelected,
                      ]}
                    >
                      {word}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : null}

        {verified && (
          <View style={styles.successRow}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.successText}>Verified! Setting up your wallet…</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.verifyBtn, !allFilled && styles.verifyBtnDisabled]}
          onPress={handleVerify}
          disabled={!allFilled || verified}
          activeOpacity={0.85}
        >
          <Text style={styles.verifyBtnText}>Verify & Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0E17' },
  scroll: { padding: 24, paddingBottom: 40 },
  back: { marginBottom: 20 },
  backText: { color: '#6C4CF1', fontSize: 16 },
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
    marginBottom: 28,
  },
  questionBlock: {
    marginBottom: 20,
  },
  questionLabel: {
    color: '#9B97B2',
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '600',
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    backgroundColor: '#1A1825',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#24223A',
  },
  optionSelected: {
    backgroundColor: '#6C4CF1',
    borderColor: '#6C4CF1',
  },
  optionCorrect: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  optionText: { color: '#9B97B2', fontSize: 14, fontWeight: '500' },
  optionTextSelected: { color: '#FFFFFF' },
  error: {
    color: '#EF4444',
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    justifyContent: 'center',
  },
  successText: { color: '#10B981', fontSize: 14 },
  verifyBtn: {
    backgroundColor: '#6C4CF1',
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  verifyBtnDisabled: { opacity: 0.4 },
  verifyBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
