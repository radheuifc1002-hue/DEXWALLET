import { Redirect } from 'expo-router';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useWallet } from '../context/WalletContext';

export default function Index() {
  const { isWalletCreated, isLocked, isLoading } = useWallet();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.logo}>XU</Text>
        <ActivityIndicator color="#6C4CF1" size="large" style={{ marginTop: 32 }} />
      </View>
    );
  }

  if (!isWalletCreated) return <Redirect href="/onboarding" />;
  if (isLocked) return <Redirect href="/pin-lock" />;
  return <Redirect href="/(tabs)/home" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0E17',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 64,
    fontWeight: '900',
    color: '#6C4CF1',
    letterSpacing: 4,
  },
});
