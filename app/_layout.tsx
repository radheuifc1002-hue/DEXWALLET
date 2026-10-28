import { useEffect, useState, Component, ReactNode } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { WalletProvider, useWallet } from '../context/WalletContext';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errStyles.container}>
          <Text style={errStyles.title}>Startup Error</Text>
          <ScrollView>
            <Text style={errStyles.message}>{this.state.error?.message}</Text>
            <Text style={errStyles.stack}>{this.state.error?.stack}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const errStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0E17', padding: 20, paddingTop: 60 },
  title: { color: '#FF4444', fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  message: { color: '#FFFFFF', fontSize: 14, marginBottom: 12 },
  stack: { color: '#AAAAAA', fontSize: 11 },
});

function NavigationGuard() {
  const { isWalletCreated, isLocked, isLoading } = useWallet();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const s0 = segments[0] as string | undefined;
    const inPinLock = s0 === 'pin-lock';
    const inAuthFlow = ['onboarding', 'set-pin', 'generate-seed', 'confirm-seed', 'import-wallet'].includes(s0 ?? '');
    const inTabs = s0 === '(tabs)';

    if (!isWalletCreated && !inAuthFlow) {
      router.replace('/onboarding');
    } else if (isWalletCreated && isLocked && !inPinLock) {
      router.replace('/pin-lock');
    } else if (isWalletCreated && !isLocked && (inPinLock || (!inTabs && !inAuthFlow && s0 !== 'send' && s0 !== 'receive' && s0 !== 'export-seed' && s0 !== 'change-pin'))) {
      router.replace('/(tabs)/home');
    }
  }, [isWalletCreated, isLocked, isLoading, segments]);

  return null;
}

function AppStack() {
  return (
    <>
      <NavigationGuard />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0F0E17' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="set-pin" />
        <Stack.Screen name="generate-seed" />
        <Stack.Screen name="confirm-seed" />
        <Stack.Screen name="import-wallet" />
        <Stack.Screen name="pin-lock" />
        <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
        <Stack.Screen name="send" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="receive" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="export-seed" />
        <Stack.Screen name="change-pin" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    const prev = (ErrorUtils as any).getGlobalHandler();
    (ErrorUtils as any).setGlobalHandler((err: Error, isFatal: boolean) => {
      setGlobalError(`[${isFatal ? 'FATAL' : 'ERROR'}] ${err?.message}\n\n${err?.stack}`);
      if (prev) prev(err, isFatal);
    });
    return () => {
      (ErrorUtils as any).setGlobalHandler(prev);
    };
  }, []);

  if (globalError) {
    return (
      <View style={errStyles.container}>
        <Text style={errStyles.title}>App Crashed</Text>
        <ScrollView>
          <Text style={errStyles.message}>{globalError}</Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <WalletProvider>
            <StatusBar style="light" />
            <AppStack />
          </WalletProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
