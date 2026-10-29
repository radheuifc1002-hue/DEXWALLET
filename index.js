// Keep startup polyfills minimal and resolve the Noble hash module through
// its explicitly exported ESM subpath. Metro warned that the old "/sha2"
// subpath was not exported, which can lead to runtime resolution differences.
require('react-native-get-random-values');

const { Buffer } = require('buffer');
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

const ed25519 = require('@noble/ed25519');
const { sha512 } = require('@noble/hashes/sha2.js');
ed25519.hashes.sha512 = sha512;
ed25519.hashes.sha512Async = async (msg) => sha512(msg);

// Load Expo Router only after native polyfills have been configured.
require('expo-router/entry');
