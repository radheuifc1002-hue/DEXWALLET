import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop, Path } from 'react-native-svg';
import { Redirect } from 'expo-router';
import { useWallet } from '../context/WalletContext';
import Onboarding from './onboarding';

function XuMark() {
  return (
    <View style={styles.logoShell}>
      <Svg width="156" height="156" viewBox="0 0 156 156">
        <Defs>
          <LinearGradient id="xuPurple" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#9478FF" />
            <Stop offset="1" stopColor="#5636D8" />
          </LinearGradient>
        </Defs>
        <Circle cx="78" cy="78" r="74" fill="url(#xuPurple)" />
        <Circle cx="78" cy="78" r="64" fill="none" stroke="#D9D0FF" strokeWidth="1.8" opacity="0.8" />
        <Path d="M35 43h22l21 25 21-25h22L89 78l32 35H99L78 88l-21 25H35l32-35z" fill="#FFFFFF" />
        <Path d="M78 88l21 25h22L89 78z" fill="#E6E0FF" opacity="0.55" />
      </Svg>
    </View>
  );
}

function LoadingRing() {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 950,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spin.start();
    return () => spin.stop();
  }, [rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]}>
      <View style={styles.spinnerCutout} />
    </Animated.View>
  );
}

export default function Index() {
  const { isWalletCreated, isLocked, isLoading } = useWallet();
  const glow = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.88, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    if (isLoading) pulse.start();
    return () => pulse.stop();
  }, [glow, isLoading]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.topOrb} />
        <View style={styles.bottomOrb} />
        <Animated.View style={{ transform: [{ scale: glow }] }}>
          <XuMark />
        </Animated.View>
        <Text style={styles.brand}>
          <Text style={styles.brandAccent}>XU</Text> WALLET
        </Text>
        <Text style={styles.tagline}>Your Keys. Your Crypto.</Text>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <View style={styles.dividerDot} />
          <View style={styles.dividerLine} />
        </View>
        <Text style={styles.features}>Send  •  Receive  •  Explore</Text>
        <View style={styles.loadingArea}>
          <LoadingRing />
          <Text style={styles.loadingText}>Initializing your wallet...</Text>
        </View>
        <Text style={styles.footer}>Web3 with Confidence</Text>
      </View>
    );
  }

  if (!isWalletCreated) return <Onboarding />;
  if (isLocked) return <Redirect href="/pin-lock" />;
  return <Redirect href="/(tabs)/home" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    overflow: 'hidden',
  },
  topOrb: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    top: -190,
    left: -130,
    backgroundColor: '#F0EBFF',
  },
  bottomOrb: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    bottom: -205,
    right: -140,
    backgroundColor: '#F2EDFF',
  },
  logoShell: {
    width: 164,
    height: 164,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 82,
    backgroundColor: '#FFFFFF',
    shadowColor: '#6C4CF1',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },
  brand: {
    marginTop: 28,
    color: '#211B3B',
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: 2.1,
  },
  brandAccent: { color: '#6C4CF1' },
  tagline: {
    marginTop: 9,
    color: '#776B99',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 30,
  },
  dividerLine: { width: 44, height: 1.5, backgroundColor: '#D9D0FF' },
  dividerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#6C4CF1' },
  features: { marginTop: 12, color: '#5B42C7', fontSize: 15, fontWeight: '600', letterSpacing: 0.15 },
  loadingArea: { alignItems: 'center', marginTop: 64 },
  spinner: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 3.5,
    borderColor: '#E7E0FF',
    borderTopColor: '#6C4CF1',
    borderRightColor: '#8E75FF',
  },
  spinnerCutout: { flex: 1 },
  loadingText: { marginTop: 17, color: '#8A72E8', fontSize: 15, fontWeight: '500' },
  footer: { position: 'absolute', bottom: 38, color: '#9A8BC4', fontSize: 13, letterSpacing: 1.1 },
});
