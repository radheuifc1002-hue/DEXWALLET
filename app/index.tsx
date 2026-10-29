import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useWallet } from '../context/WalletContext';
import Onboarding from './onboarding';

// Render the first-run screen directly. The previous version rendered only
// an endless XU spinner and relied on a second component to redirect away.
// Keeping initial routing here makes the release APK show real app content.
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

  if (!isWalletCreated) {
    return <Onboarding />;
  }

  if (isLocked) {
    return <Redirect href="/pin-lock" />;
  }

  return <Redirect href="/(tabs)/home" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
