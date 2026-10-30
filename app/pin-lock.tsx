import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '../context/WalletContext';
import PinPad from '../components/PinPad';

export default function PinLock() {
  const router = useRouter();
  const { pin, biometricEnabled, setIsLocked } = useWallet();
  const [entered, setEntered] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const biometricInProgress = useRef(false);
  const mounted = useRef(true);

  const PIN_LENGTH = 6;

  useEffect(() => {
    mounted.current = true;
    const check = async () => {
      try {
        const [hw, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (!mounted.current) return;
        setBiometricAvailable(hw && enrolled && biometricEnabled);
        if (hw && enrolled && biometricEnabled) await tryBiometric();
      } catch {
        if (mounted.current) setBiometricAvailable(false);
      }
    };
    check();
    return () => { mounted.current = false; };
  }, [biometricEnabled]);

  useEffect(() => {
    if (entered.length === PIN_LENGTH) {
      verifyPin(entered);
    }
  }, [entered]);

  const tryBiometric = async () => {
    if (biometricInProgress.current) return;
    biometricInProgress.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock XU Wallet',
        cancelLabel: 'Use PIN',
        fallbackLabel: 'Use PIN',
        disableDeviceFallback: false,
      });
      if (result.success && mounted.current) unlock();
    } catch {
      // A cancelled or unavailable biometric prompt must leave PIN unlock usable.
    } finally {
      biometricInProgress.current = false;
    }
  };

  const verifyPin = (p: string) => {
    if (p === pin) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      unlock();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const next = attempts + 1;
      setAttempts(next);
      if (next >= 5) {
        setError('Too many attempts. Please wait 30s.');
        setTimeout(() => {
          setAttempts(0);
          setError('');
          setEntered('');
        }, 30000);
      } else {
        setError(`Incorrect PIN. ${5 - next} attempts left.`);
        setTimeout(() => setEntered(''), 400);
      }
    }
  };

  const unlock = () => {
    setIsLocked(false);
    router.replace('/(tabs)/home');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.logo}>XU</Text>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Enter your PIN to unlock</Text>

        <PinPad
          value={entered}
          onChange={setEntered}
          maxLength={PIN_LENGTH}
          errorMsg={error}
        />

        {biometricAvailable && (
          <TouchableOpacity
            style={styles.bioBtn}
            onPress={tryBiometric}
            activeOpacity={0.7}
          >
            <Ionicons name="finger-print" size={32} color="#6C4CF1" />
            <Text style={styles.bioBtnText}>Use Biometrics</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  logo: {
    fontSize: 48,
    fontWeight: '900',
    color: '#6C4CF1',
    letterSpacing: 4,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#211B35',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#777286',
    marginBottom: 40,
  },
  bioBtn: {
    alignItems: 'center',
    marginTop: 28,
    gap: 6,
  },
  bioBtnText: {
    color: '#6C4CF1',
    fontSize: 14,
    fontWeight: '600',
  },
});
