// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * expo-sqlite's web backend is a WebAssembly build of SQLite, and its worker
 * imports `wa-sqlite.wasm` directly. Metro does not treat `.wasm` as an asset
 * by default, so without this the web bundle fails to resolve it and the whole
 * app fails to build — native is unaffected, which makes it an easy thing to
 * discover late.
 */
config.resolver.assetExts.push('wasm');

module.exports = config;
