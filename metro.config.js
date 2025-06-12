// metro.config.js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { wrapWithReanimatedMetroConfig } = require('react-native-reanimated/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

const customConfig = {
  resolver: {
    assetExts: [...defaultConfig.resolver.assetExts, 'tflite'],
  },
};

module.exports = wrapWithReanimatedMetroConfig(
  mergeConfig(defaultConfig, customConfig)
);