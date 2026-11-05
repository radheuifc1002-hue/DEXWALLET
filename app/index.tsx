import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Redirect } from 'expo-router';
import { useWallet } from '../context/WalletContext';
import Onboarding from './onboarding';

export default function Index() {
  const { isWalletCreated, isLocked, isLoading } = useWallet();
  const pulse = useRef(new Animated.Value(0.94)).current;
  const fade = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.94, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
      ]),
      Animated.sequence([
        Animated.timing(fade, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0.45, duration: 900, useNativeDriver: true })
      ])
    ]));
    if (isLoading) animation.start();
    return () => animation.stop();
  }, [isLoading, pulse, fade]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.mark, { transform: [{ scale: pulse }], opacity: fade }]}>
          <Text style={styles.markText}>XU</Text>
        </Animated.View>
        <Text style={styles.brand}>XU WALLET</Text>
        <Text style={styles.tagline}>Your Keys. Your Crypto.</Text>
        <View style={styles.dots}><View style={styles.dot} /><View style={styles.dot} /><View style={styles.dot} /></View>
      </View>
    );
  }
  if (!isWalletCreated) return <Onboarding />;
  if (isLocked) return <Redirect href="/pin-lock" />;
  return <Redirect href="/(tabs)/home" />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  mark: { width: 112, height: 112, borderRadius: 56, backgroundColor: '#6C4CF1', borderWidth: 4, borderColor: '#D8D0FF', alignItems: 'center', justifyContent: 'center', shadowColor: '#6C4CF1', shadowOpacity: 0.2, shadowRadius: 24, elevation: 8 },
  markText: { color: '#FFFFFF', fontSize: 42, fontWeight: '900', letterSpacing: -2 },
  brand: { marginTop: 30, color: '#271F45', fontSize: 25, fontWeight: '900', letterSpacing: 3 },
  tagline: { marginTop: 9, color: '#81769F', fontSize: 14, letterSpacing: 0.3 },
  dots: { flexDirection: 'row', gap: 7, marginTop: 34 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#6C4CF1' }
});