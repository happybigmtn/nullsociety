const nativeModules = require("react-native/jest/mocks/NativeModules");

if (!nativeModules.UIManager) {
  nativeModules.UIManager = {};
}

if (!nativeModules.NativeUnimoduleProxy) {
  nativeModules.NativeUnimoduleProxy = { viewManagersMetadata: {} };
}

if (!nativeModules.NativeUnimoduleProxy.viewManagersMetadata) {
  nativeModules.NativeUnimoduleProxy.viewManagersMetadata = {};
}

module.exports = nativeModules;
