import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { useWallet } from '../context/WalletContext';
import PinPad from '../components/PinPad';

type Step = 'current' | 'new' | 'confirm';

export default function ChangePin() {
  const router = useRouter();
  const { setPin } = useWallet();
  const [step, setStep] = useState<Step>('current');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const PIN_LENGTH = 6;

  useEffect(() => {
    if (step === 'current' && currentPin.length === PIN_LENGTH) {
      verifyCurrent();
    }
  }, [currentPin]);

  useEffect(() => {
    if (step === 'new' && newPin.length === PIN_LENGTH) {
      setTimeout(() => setStep('confirm'), 200);
    }
  }, [newPin]);

  useEffect(() => {
    if (step === 'confirm' && confirmPin.length === PIN_LENGTH) {
      finalizeChange();
    }
  }, [confirmPin]);

  const verifyCurrent = async () => {
    const stored = await SecureStore.getItemAsync('xu_wallet_pin');
    if (currentPin === stored) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setError('');
      setStep('new');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError('Incorrect PIN. Try again.');
      setTimeout(() => {
        setCurrentPin('');
        setError('');
      }, 800);
    }
  };

  const finalizeChange = async () => {
    if (confirmPin !== newPin) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("PINs don't match. Try again.");
      setTimeout(() => {
        setConfirmPin('');
        setError('');
      }, 800);
      return;
    }
    await setPin(newPin);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSuccess(true);
    setTimeout(() => router.back(), 1500);
  };

  const STEPS: Record<Step, { label: string; value: string; onChange: (v: string) => void }> = {
    current: { label: 'Enter current PIN', value: currentPin, onChange: setCurrentPin },
    new: { label: 'Enter new PIN', value: newPin, onChange: setNewPin },
    confirm: { label: 'Confirm new PIN', value: confirmPin, onChange: setConfirmPin },
  };

  const curr = STEPS[step];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.stepRow}>
          {(['current', 'new', 'confirm'] as Step[]).map((s, i) => (
            <View key={s} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={[
                  styles.stepDot,
                  step === s && styles.stepDotActive,
                  (step === 'new' && i === 0) ||
                  (step === 'confirm' && i < 2)
                    ? styles.stepDotDone
                    : null,
                ]}
              />
              {i < 2 && <View style={styles.stepLine} />}
            </View>
          ))}
        </View>

        <Text style={styles.title}>Change PIN</Text>

        {success ? (
          <Text style={styles.success}>✓ PIN changed successfully!</Text>
        ) : (
          <PinPad
            value={curr.value}
            onChange={curr.onChange}
            maxLength={PIN_LENGTH}
            label={curr.label}
            errorMsg={error}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0E17' },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  backText: { color: '#6C4CF1', fontSize: 16 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
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
  stepDotActive: { backgroundColor: '#6C4CF1' },
  stepDotDone: { backgroundColor: '#10B981', borderColor: '#10B981' },
  stepLine: { width: 32, height: 2, backgroundColor: '#24223A', marginHorizontal: 4 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', marginBottom: 32 },
  success: { fontSize: 18, color: '#10B981', fontWeight: '700' },
});
