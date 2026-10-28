import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useWallet } from '../context/WalletContext';
import PinPad from '../components/PinPad';

export default function SetPin() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mnemonic?: string }>();
  const { setPin, initWallet, seedPhrase } = useWallet();

  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [firstPin, setFirstPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const PIN_LENGTH = 6;

  useEffect(() => {
    if (step === 'enter' && firstPin.length === PIN_LENGTH) {
      setTimeout(() => setStep('confirm'), 200);
    }
  }, [firstPin, step]);

  useEffect(() => {
    if (step === 'confirm' && confirmPin.length === PIN_LENGTH) {
      handleConfirm();
    }
  }, [confirmPin, step]);

  const handleConfirm = async () => {
    if (confirmPin !== firstPin) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError('PINs do not match. Try again.');
      setConfirmPin('');
      return;
    }

    const mnemonic = params.mnemonic || (seedPhrase.length > 0 ? seedPhrase.join(' ') : null);
    if (!mnemonic) {
      Alert.alert('Error', 'No wallet seed found. Please restart the setup.');
      return;
    }

    setLoading(true);
    try {
      await setPin(confirmPin);
      await initWallet(mnemonic);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)/home');
    } catch (e) {
      Alert.alert('Error', 'Failed to set up wallet. Please try again.');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {step === 'confirm' && (
          <TouchableOpacity
            onPress={() => {
              setStep('enter');
              setFirstPin('');
              setConfirmPin('');
              setError('');
            }}
            style={styles.back}
          >
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.stepRow}>
          <View style={[styles.stepDot, step === 'enter' && styles.stepDotActive]} />
          <View style={styles.stepLine} />
          <View style={[styles.stepDot, step === 'confirm' && styles.stepDotActive]} />
        </View>

        <Text style={styles.title}>
          {step === 'enter' ? 'Create PIN' : 'Confirm PIN'}
        </Text>
        <Text style={styles.subtitle}>
          {step === 'enter'
            ? 'Choose a 6-digit PIN to secure your wallet'
            : 'Re-enter your PIN to confirm'}
        </Text>

        <PinPad
          value={step === 'enter' ? firstPin : confirmPin}
          onChange={step === 'enter' ? setFirstPin : setConfirmPin}
          maxLength={PIN_LENGTH}
          errorMsg={error}
        />

        {loading && (
          <Text style={styles.loadingText}>Setting up your wallet…</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0E17' },
  header: { paddingHorizontal: 20, paddingTop: 12, minHeight: 44 },
  back: { alignSelf: 'flex-start' },
  backText: { color: '#6C4CF1', fontSize: 16 },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#24223A',
    borderWidth: 2,
    borderColor: '#6C4CF1',
  },
  stepDotActive: {
    backgroundColor: '#6C4CF1',
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: '#24223A',
    marginHorizontal: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#9B97B2',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  loadingText: {
    color: '#9B97B2',
    marginTop: 20,
    fontSize: 14,
  },
});
