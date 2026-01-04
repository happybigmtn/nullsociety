/* eslint-env jest */
import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

process.env.EXPO_PUBLIC_BILLING_URL ||= 'https://billing.test';
process.env.EXPO_PUBLIC_OPS_URL ||= 'https://ops.test';
process.env.EXPO_PUBLIC_WEBSITE_URL ||= 'https://site.test';

const { webcrypto } = require('crypto');

if (!global.crypto) {
  global.crypto = webcrypto;
}

const mockSecureStoreData = new Map();
const mockMmkvData = new Map();

beforeEach(() => {
  mockSecureStoreData.clear();
  mockMmkvData.clear();
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key) => mockSecureStoreData.get(key) ?? null),
  setItemAsync: jest.fn(async (key, value) => {
    mockSecureStoreData.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key) => {
    mockSecureStoreData.delete(key);
  }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

jest.mock('react-native-mmkv', () => ({
  MMKV: class MMKV {
    getBoolean(key) {
      const value = mockMmkvData.get(key);
      if (value === undefined) return undefined;
      return value === 'true';
    }
    getString(key) {
      const value = mockMmkvData.get(key);
      return value === undefined ? undefined : String(value);
    }
    getNumber(key) {
      const value = mockMmkvData.get(key);
      if (value === undefined) return undefined;
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    }
    set(key, value) {
      mockMmkvData.set(key, String(value));
    }
    delete(key) {
      mockMmkvData.delete(key);
    }
    contains(key) {
      return mockMmkvData.has(key);
    }
    clearAll() {
      mockMmkvData.clear();
    }
  },
}));

jest.mock('expo-constants', () => ({
  appOwnership: 'standalone',
  expoConfig: {
    hostUri: 'localhost:19000',
    runtimeVersion: 'test',
    version: '0.0.0',
    sdkVersion: '54.0.0',
    ios: { buildNumber: '1' },
    android: { versionCode: 1 },
    extra: { eas: { projectId: 'test-project' } },
  },
  easConfig: { projectId: 'test-project' },
}));

jest.mock('expo-device', () => ({
  isDevice: true,
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn((path = '') => `nullspace://${path}`),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  AndroidImportance: { DEFAULT: 'default' },
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'Light',
    Medium: 'Medium',
    Heavy: 'Heavy',
  },
  NotificationFeedbackType: {
    Success: 'Success',
    Warning: 'Warning',
    Error: 'Error',
  },
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));
