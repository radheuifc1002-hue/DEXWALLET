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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Keep web-only project directories out of Metro without excluding any
// dependency folder named "src" elsewhere in node_modules.
const webOnlyRoots = ['src', 'web-app'].map((folder) => path.resolve(__dirname, folder));
const webOnlyPatterns = webOnlyRoots.map(
  (root) => new RegExp('^' + escapeRegExp(root) + '[/\\\\].*')
);
const viteConfigPattern = new RegExp(
  '^' + escapeRegExp(path.resolve(__dirname, 'vite.config.ts')) + '$'
);

config.resolver.blockList = [
  ...(config.resolver.blockList || []),
  ...webOnlyPatterns,
  viteConfigPattern,
];

module.exports = config;
