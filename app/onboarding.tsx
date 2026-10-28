import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function Onboarding() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>XU</Text>
        <Text style={styles.tagline}>Non-Custodial Multi-Chain Wallet</Text>
        <Text style={styles.sub}>
          Solana · Ethereum · BNB · Polygon
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push('/generate-seed')}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle-outline" size={22} color="#fff" />
          <Text style={styles.primaryBtnText}>Create New Wallet</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.push('/import-wallet')}
          activeOpacity={0.85}
        >
          <Ionicons name="download-outline" size={22} color="#6C4CF1" />
          <Text style={styles.secondaryBtnText}>Import Existing Wallet</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Your keys, your coins. XU is fully non-custodial.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0E17',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 80,
    fontWeight: '900',
    color: '#6C4CF1',
    letterSpacing: 6,
    marginBottom: 16,
  },
  tagline: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  sub: {
    fontSize: 14,
    color: '#9B97B2',
    textAlign: 'center',
  },
  actions: {
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: '#6C4CF1',
    borderRadius: 16,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: '#1A1825',
    borderRadius: 16,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#6C4CF1',
  },
  secondaryBtnText: {
    color: '#6C4CF1',
    fontSize: 17,
    fontWeight: '700',
  },
  disclaimer: {
    color: '#9B97B2',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});
