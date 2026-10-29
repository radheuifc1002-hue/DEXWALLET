const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  crypto: path.resolve(__dirname, 'node_modules/crypto-browserify'),
  stream: path.resolve(__dirname, 'node_modules/readable-stream'),
  'stream/web': path.resolve(__dirname, 'node_modules/readable-stream'),
  buffer: path.resolve(__dirname, 'node_modules/buffer'),
  http: path.resolve(__dirname, 'node_modules/stream-http'),
  https: path.resolve(__dirname, 'node_modules/https-browserify'),
  os: path.resolve(__dirname, 'node_modules/os-browserify'),
  path: path.resolve(__dirname, 'node_modules/path-browserify'),
  vm: path.resolve(__dirname, 'node_modules/vm-browserify'),
  zlib: path.resolve(__dirname, 'node_modules/browserify-zlib'),
  util: path.resolve(__dirname, 'node_modules/util'),
  events: path.resolve(__dirname, 'node_modules/events'),
};

// The React/Vite website lives outside the Expo app. Keep it out of Metro's
// native module graph so the Android bundle only resolves app/ native routes.
config.resolver.blockList = [
  /[/\\]web-app[/\\].*/,
];

module.exports = config;
