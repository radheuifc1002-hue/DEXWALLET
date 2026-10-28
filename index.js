// Polyfills must run before everything else
require('react-native-get-random-values');

const { Buffer } = require('buffer');
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

// Configure @noble/ed25519 sha512 for React Native (crypto.subtle is not available in RN)
const { sha512 } = require('@noble/hashes/sha2');
const { hashes } = require('@noble/ed25519');
hashes.sha512 = (msg) => sha512(msg);
hashes.sha512Async = async (msg) => sha512(msg);

// Load the Expo Router entry point last
require('expo-router/entry');
