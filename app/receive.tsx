import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '../context/WalletContext';

const CHAIN_SYMBOLS: Record<string, string> = {
  ethereum: 'ETH',
  solana: 'SOL',
  bnb: 'BNB',
  polygon: 'MATIC',
};

const CHAIN_COLORS: Record<string, string> = {
  ethereum: '#627EEA',
  solana: '#9945FF',
  bnb: '#F3BA2F',
  polygon: '#8247E5',
};

export default function Receive() {
  const router = useRouter();
  const { walletAddresses, selectedBlockchain, setSelectedBlockchain } = useWallet();
  const [copied, setCopied] = useState(false);

  const address = walletAddresses
    ? walletAddresses[selectedBlockchain]
    : null;

  const handleCopy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  };

  const CHAINS: Array<'ethereum' | 'solana' | 'bnb' | 'polygon'> = [
    'ethereum', 'solana', 'bnb', 'polygon',
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Receive</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.chainTabs}>
          {CHAINS.map((chain) => (
            <TouchableOpacity
              key={chain}
              style={[
                styles.chainTab,
                selectedBlockchain === chain && styles.chainTabActive,
              ]}
              onPress={() => setSelectedBlockchain(chain)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chainTabText,
                  selectedBlockchain === chain && { color: '#FFFFFF' },
                ]}
              >
                {CHAIN_SYMBOLS[chain]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {address ? (
          <>
            <View style={styles.qrCard}>
              <View
                style={[
                  styles.qrBorder,
                  { borderColor: CHAIN_COLORS[selectedBlockchain] + '44' },
                ]}
              >
                <QRCode
                  value={address}
                  size={200}
                  color="#0F0E17"
                  backgroundColor="#FFFFFF"
                />
              </View>
              <Text style={styles.chainLabel}>
                {CHAIN_SYMBOLS[selectedBlockchain]} Address
              </Text>
            </View>

            <View style={styles.addressCard}>
              <Text style={styles.addressText}>{address}</Text>
              <TouchableOpacity
                style={styles.copyBtn}
                onPress={handleCopy}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={copied ? 'checkmark' : 'copy-outline'}
                  size={18}
                  color={copied ? '#10B981' : '#FFFFFF'}
                />
                <Text style={[styles.copyBtnText, copied && { color: '#10B981' }]}>
                  {copied ? 'Copied!' : 'Copy Address'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.warning}>
              <Ionicons name="information-circle-outline" size={16} color="#9B97B2" />
              <Text style={styles.warningText}>
                Only send {CHAIN_SYMBOLS[selectedBlockchain]} and compatible tokens to
                this address.
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No wallet address found.</Text>
          </View>
        )}
      </ScrollView>
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  scroll: { padding: 20, paddingBottom: 40, alignItems: 'center' },
  chainTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 28,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  chainTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1A1825',
    borderWidth: 1,
    borderColor: '#24223A',
  },
  chainTabActive: {
    backgroundColor: '#6C4CF1',
    borderColor: '#6C4CF1',
  },
  chainTabText: { color: '#9B97B2', fontSize: 13, fontWeight: '700' },
  qrCard: {
    backgroundColor: '#1A1825',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  qrBorder: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  chainLabel: {
    color: '#9B97B2',
    fontSize: 14,
    fontWeight: '600',
  },
  addressCard: {
    backgroundColor: '#1A1825',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    marginBottom: 14,
  },
  addressText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'monospace',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 14,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6C4CF1',
    borderRadius: 12,
    paddingVertical: 12,
  },
  copyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    width: '100%',
  },
  warningText: { color: '#9B97B2', fontSize: 12, flex: 1, lineHeight: 18 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#4A4760', fontSize: 15 },
});
