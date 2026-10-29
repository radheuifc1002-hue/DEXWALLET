import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';

// NavigationGuard in app/_layout.tsx is the single source of truth for the
// initial route. Do not redirect here as well: two simultaneous redirects
// during WalletProvider hydration can leave the release app on a blank screen.
export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>XU</Text>
      <ActivityIndicator color="#6C4CF1" size="large" style={{ marginTop: 32 }} />
    </View>
  );
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
