import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

const DAPP_SHORTCUTS = [
  { name: 'Uniswap', url: 'https://app.uniswap.org', icon: '🦄' },
  { name: 'OpenSea', url: 'https://opensea.io', icon: '🌊' },
  { name: 'Aave', url: 'https://app.aave.com', icon: '👻' },
  { name: 'Jupiter', url: 'https://jup.ag', icon: '🪐' },
  { name: 'Magic Eden', url: 'https://magiceden.io', icon: '✨' },
  { name: 'dYdX', url: 'https://trade.dydx.exchange', icon: '⚡' },
];

export default function Browser() {
  const [url, setUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(false);
  const webRef = useRef<WebView>(null);

  const navigate = (target: string) => {
    let dest = target.trim();
    if (!dest.startsWith('http')) dest = 'https://' + dest;
    setUrl(dest);
    setInputUrl(dest);
  };

  const handleSubmit = () => {
    if (inputUrl.trim()) navigate(inputUrl);
  };

  if (!url) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.urlBar}>
          <Ionicons name="globe-outline" size={18} color="#9B97B2" />
          <TextInput
            style={styles.urlInput}
            value={inputUrl}
            onChangeText={setInputUrl}
            onSubmitEditing={handleSubmit}
            placeholder="Search or enter URL"
            placeholderTextColor="#4A4760"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
          />
          {inputUrl ? (
            <TouchableOpacity onPress={() => setInputUrl('')}>
              <Ionicons name="close-circle" size={18} color="#9B97B2" />
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Popular DApps</Text>
        <View style={styles.grid}>
          {DAPP_SHORTCUTS.map((app) => (
            <TouchableOpacity
              key={app.url}
              style={styles.dappCard}
              onPress={() => navigate(app.url)}
              activeOpacity={0.8}
            >
              <Text style={styles.dappEmoji}>{app.icon}</Text>
              <Text style={styles.dappName}>{app.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.urlBar}>
          <Ionicons
            name={loading ? 'reload-outline' : 'lock-closed-outline'}
            size={16}
            color="#9B97B2"
          />
          <TextInput
            style={styles.urlInput}
            value={inputUrl}
            onChangeText={setInputUrl}
            onSubmitEditing={handleSubmit}
            placeholder="Enter URL"
            placeholderTextColor="#4A4760"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
          />
        </View>

        <WebView
          ref={webRef}
          source={{ uri: url }}
          style={{ flex: 1 }}
          onNavigationStateChange={(state) => {
            setCanGoBack(state.canGoBack);
            setCanGoForward(state.canGoForward);
            setInputUrl(state.url);
            setLoading(state.loading);
          }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          javaScriptEnabled
          domStorageEnabled
        />

        <View style={styles.navBar}>
          <TouchableOpacity
            onPress={() => webRef.current?.goBack()}
            disabled={!canGoBack}
            style={[styles.navBtn, !canGoBack && styles.navBtnDisabled]}
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => webRef.current?.goForward()}
            disabled={!canGoForward}
            style={[styles.navBtn, !canGoForward && styles.navBtnDisabled]}
          >
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => webRef.current?.reload()}
            style={styles.navBtn}
          >
            <Ionicons name="reload" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setUrl('');
              setInputUrl('');
            }}
            style={styles.navBtn}
          >
            <Ionicons name="home-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0E17' },
  urlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1A1825',
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 44,
  },
  urlInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 20,
    marginBottom: 12,
    marginTop: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 10,
  },
  dappCard: {
    width: '30%',
    backgroundColor: '#1A1825',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  dappEmoji: { fontSize: 28 },
  dappName: { color: '#9B97B2', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#0F0E17',
    borderTopWidth: 1,
    borderTopColor: '#1A1825',
    height: 52,
    paddingHorizontal: 20,
  },
  navBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#1A1825',
  },
  navBtnDisabled: { opacity: 0.3 },
});
