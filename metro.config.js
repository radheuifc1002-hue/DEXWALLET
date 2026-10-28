import { getDefaultConfig } from 'expo/metro-config.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  crypto: resolve(__dirname, 'node_modules/crypto-browserify'),
  stream: resolve(__dirname, 'node_modules/readable-stream'),
  'stream/web': resolve(__dirname, 'node_modules/readable-stream'),
  buffer: resolve(__dirname, 'node_modules/buffer'),
  http: resolve(__dirname, 'node_modules/stream-http'),
  https: resolve(__dirname, 'node_modules/https-browserify'),
  os: resolve(__dirname, 'node_modules/os-browserify'),
  path: resolve(__dirname, 'node_modules/path-browserify'),
  vm: resolve(__dirname, 'node_modules/vm-browserify'),
  zlib: resolve(__dirname, 'node_modules/browserify-zlib'),
  util: resolve(__dirname, 'node_modules/util'),
  events: resolve(__dirname, 'node_modules/events'),
};

export default config;
