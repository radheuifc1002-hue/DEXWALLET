import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '../../context/WalletContext';
import { SafeAreaView as SafeAreaContextView } from 'react-native-safe-area-context';
import { isIndexedHistoryEnabled, setIndexedHistoryEnabled } from '../../mobile/services/indexedHistoryPreference';

export default function Settings() {
  const router = useRouter();
  const {
    biometricEnabled,
    setBiometricEnabled,
    autoLockTimer,
    setAutoLockTimer,
    resetWallet,
    setIsLocked,
  } = useWallet();
  const [bioToggling, setBioToggling] = useState(false);
  const [indexedHistoryEnabled, setIndexedHistoryEnabledState] = useState(false);

  useEffect(() => {
    let mounted = true;
    void isIndexedHistoryEnabled().then((enabled) => {
      if (mounted) setIndexedHistoryEnabledState(enabled);
    });
    return () => { mounted = false; };
  }, []);

  const handleIndexedHistoryToggle = (value: boolean) => {
    if (value) {
      Alert.alert(
        'Enable Indexed History?',
        'XU Wallet will send the public wallet address for the selected network to its indexing service and store public transaction history to make history faster and reduce repeated provider requests. Your seed phrase, private keys and signing data never leave this device. Linking an address to this service can still affect your privacy.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enable', onPress: async () => {
            try {
              await setIndexedHistoryEnabled(true);
              setIndexedHistoryEnabledState(true);
            } catch {
              Alert.alert('Could not enable', 'The preference could not be saved on this device.');
            }
          } },
        ]
      );
      return;
    }
    Alert.alert(
      'Disable Indexed History?',
      'XU Wallet will stop sending addresses for new indexing requests and will use direct history providers. Public blockchain records already indexed may remain in the shared cache.',
      [
        { text: 'Keep enabled', style: 'cancel' },
        { text: 'Disable', style: 'destructive', onPress: async () => {
          try {
            await setIndexedHistoryEnabled(false);
            setIndexedHistoryEnabledState(false);
          } catch {
            Alert.alert('Could not disable', 'The preference could not be saved on this device.');
          }
        } },
      ]
    );
  };

  const handleBioToggle = async (val: boolean) => {
    setBioToggling(true);
    try {
      if (val) {
        const [hw, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (!hw || !enrolled) {
          Alert.alert(
            'Biometrics Unavailable',
            'Your device does not have biometric authentication enrolled.',
            [{ text: 'OK' }]
          );
          return;
        }
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Enable biometric unlock',
          cancelLabel: 'Cancel',
          fallbackLabel: 'Use PIN',
        });
        if (!result.success) return;
      }
      await setBiometricEnabled(val);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Biometric Error', 'Biometric authentication could not be started. You can still unlock using your PIN.');
    } finally {
      setBioToggling(false);
    }
  };

  const handleRemoveWallet = () => {
    Alert.alert(
      'Remove Wallet',
      'This will permanently delete your wallet from this device. Make sure you have your seed phrase backed up.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Wallet',
          style: 'destructive',
          onPress: async () => {
            await resetWallet();
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

  const LOCK_OPTIONS = [1, 5, 15, 30, 0];
  const lockLabel = (v: number) => (v === 0 ? 'Never' : `${v} min`);

  return (
    <SafeAreaContextView edges={["top"]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.pageTitle}>Settings</Text>

        <Text style={styles.sectionLabel}>Security</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="finger-print" size={20} color="#6C4CF1" />
              <Text style={styles.rowLabel}>Biometric Unlock</Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={handleBioToggle}
              disabled={bioToggling}
              trackColor={{ false: '#24223A', true: '#6C4CF1' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/change-pin')}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="keypad-outline" size={20} color="#6C4CF1" />
              <Text style={styles.rowLabel}>Change PIN</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9B97B2" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.col}>
            <View style={styles.rowLeft}>
              <Ionicons name="timer-outline" size={20} color="#6C4CF1" />
              <Text style={styles.rowLabel}>Auto-Lock</Text>
            </View>
            <View style={styles.lockOptions}>
              {LOCK_OPTIONS.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.lockChip,
                    autoLockTimer === v && styles.lockChipActive,
                  ]}
                  onPress={() => setAutoLockTimer(v)}
                >
                  <Text
                    style={[
                      styles.lockChipText,
                      autoLockTimer === v && { color: '#211B35' },
                    ]}
                  >
                    {lockLabel(v)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Wallet</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/export-seed')}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="key-outline" size={20} color="#6C4CF1" />
              <Text style={styles.rowLabel}>Export Seed Phrase</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9B97B2" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => setIsLocked(true)}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="lock-closed-outline" size={20} color="#6C4CF1" />
              <Text style={styles.rowLabel}>Lock Wallet Now</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9B97B2" />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Privacy & Data</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="cloud-download-outline" size={20} color="#6C4CF1" />
              <Text style={styles.rowLabel}>Indexed Transaction History</Text>
            </View>
            <Switch
              value={indexedHistoryEnabled}
              onValueChange={handleIndexedHistoryToggle}
              trackColor={{ false: '#24223A', true: '#6C4CF1' }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text style={styles.helperText}>
            Optional. Shares public wallet addresses with XU's indexer to cache transaction history. Private keys and recovery phrases are never sent. Disabling stops future indexing requests; previously indexed public chain data may remain in the shared index.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Danger Zone</Text>
        <View style={[styles.card, styles.dangerCard]}>
          <TouchableOpacity
            style={styles.row}
            onPress={handleRemoveWallet}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={[styles.rowLabel, { color: '#EF4444' }]}>
                Remove Wallet
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>XU Wallet v1.0.0</Text>
      </ScrollView>
    </SafeAreaContextView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { padding: 20, paddingBottom: 40 },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#211B35',
    marginBottom: 24,
  },
  sectionLabel: {
    color: '#777286',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
  },
  dangerCard: {
    borderWidth: 1,
    borderColor: '#EF444422',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  col: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    color: '#211B35',
    fontSize: 15,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F0FF',
    marginHorizontal: 16,
  },
  lockOptions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  lockChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F3F0FF',
    borderWidth: 1,
    borderColor: '#E8E4F3',
  },
  lockChipActive: {
    backgroundColor: '#6C4CF1',
    borderColor: '#6C4CF1',
  },
  lockChipText: {
    color: '#777286',
    fontSize: 13,
    fontWeight: '600',
  },
  version: {
    color: '#9A95A8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
  },
});
