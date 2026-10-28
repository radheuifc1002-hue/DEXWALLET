import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '../context/WalletContext';

const CHAIN_SYMBOLS: Record<string, string> = {
  ethereum: 'ETH',
  solana: 'SOL',
  bnb: 'BNB',
  polygon: 'MATIC',
};

export default function Send() {
  const router = useRouter();
  const { selectedBlockchain, walletAddresses, tokens } = useWallet();
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState(selectedBlockchain);

  const nativeTokens = tokens.filter((t) => !t.contractAddress);

  const handleSend = () => {
    if (!toAddress.trim()) {
      Alert.alert('Missing Address', 'Please enter the recipient address.');
      return;
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    Alert.alert(
      'Confirm Transaction',
      `Send ${amount} ${CHAIN_SYMBOLS[selectedToken]} to\n${toAddress.slice(0, 16)}…${toAddress.slice(-8)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert(
              'Coming Soon',
              'Transaction signing will be available in the next update.',
              [{ text: 'OK', onPress: () => router.back() }]
            );
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionLabel}>Asset</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 20 }}
          >
            {nativeTokens.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.tokenChip,
                  selectedToken === t.blockchain && styles.tokenChipActive,
                ]}
                onPress={() => setSelectedToken(t.blockchain)}
              >
                <Text
                  style={[
                    styles.tokenChipText,
                    selectedToken === t.blockchain && { color: '#FFFFFF' },
                  ]}
                >
                  {t.symbol}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.sectionLabel}>Recipient Address</Text>
          <View style={styles.inputCard}>
            <TextInput
              style={styles.input}
              value={toAddress}
              onChangeText={setToAddress}
              placeholder="0x... or Sol address"
              placeholderTextColor="#4A4760"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Text style={styles.sectionLabel}>Amount</Text>
          <View style={styles.amountRow}>
            <View style={[styles.inputCard, { flex: 1 }]}>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor="#4A4760"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.symbolBadge}>
              <Text style={styles.symbolText}>{CHAIN_SYMBOLS[selectedToken]}</Text>
            </View>
          </View>

          <View style={styles.fromRow}>
            <Ionicons name="wallet-outline" size={14} color="#9B97B2" />
            <Text style={styles.fromText}>
              From:{' '}
              {walletAddresses
                ? `${walletAddresses[selectedToken as keyof typeof walletAddresses]?.slice(0, 10)}…`
                : '—'}
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.sendBtn}
            onPress={handleSend}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0E17' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1825',
  },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scroll: { padding: 20, paddingBottom: 20 },
  sectionLabel: {
    color: '#9B97B2',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  tokenChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1A1825',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#24223A',
  },
  tokenChipActive: {
    backgroundColor: '#6C4CF1',
    borderColor: '#6C4CF1',
  },
  tokenChipText: { color: '#9B97B2', fontSize: 13, fontWeight: '700' },
  inputCard: {
    backgroundColor: '#1A1825',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#24223A',
    marginBottom: 16,
  },
  input: {
    color: '#FFFFFF',
    fontSize: 15,
    padding: 14,
  },
  amountRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  symbolBadge: {
    backgroundColor: '#1A1825',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#24223A',
  },
  symbolText: { color: '#9B97B2', fontSize: 14, fontWeight: '700' },
  fromRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  fromText: { color: '#9B97B2', fontSize: 13 },
  footer: {
    padding: 20,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#1A1825',
  },
  sendBtn: {
    backgroundColor: '#6C4CF1',
    borderRadius: 16,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
