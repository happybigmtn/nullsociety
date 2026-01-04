/**
 * Authentication service with biometric support
 */
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { getPublicKey, bytesToHex } from './crypto';

export interface AuthResult {
  success: boolean;
  error?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  publicKey: string | null;
  isNewUser: boolean;
}

const USER_INITIALIZED_KEY = 'user_initialized';
const isWeb = Platform.OS === 'web';

const WebSecureStore = {
  getItemAsync: async (key: string) => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  },
  setItemAsync: async (key: string, value: string) => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  },
};

const Store = isWeb ? WebSecureStore : SecureStore;

/**
 * Authenticate using device biometrics or PIN
 * Returns true if authentication succeeded
 */
export async function authenticateWithBiometrics(): Promise<boolean> {
  if (isWeb) {
    return true;
  }
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();

  if (!hasHardware) {
    // Device doesn't support biometrics - still require device PIN
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Enter your device PIN to access Nullspace',
      disableDeviceFallback: false,
    });
    return result.success;
  }

  if (!isEnrolled) {
    // Biometrics available but not set up - require device credential
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Set up biometrics or enter PIN to access Nullspace',
      disableDeviceFallback: false,
    });
    return result.success;
  }

  // Biometrics available and enrolled
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Authenticate to access Nullspace',
    fallbackLabel: 'Use PIN',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });

  return result.success;
}


/**
 * Get supported authentication types
 */
export async function getSupportedAuthTypes(): Promise<LocalAuthentication.AuthenticationType[]> {
  if (isWeb) return [];
  return await LocalAuthentication.supportedAuthenticationTypesAsync();
}

/**
 * Check if device has biometric hardware
 */
export async function hasBiometricHardware(): Promise<boolean> {
  if (isWeb) return false;
  return await LocalAuthentication.hasHardwareAsync();
}

/**
 * Check if biometrics are enrolled
 */
export async function isBiometricEnrolled(): Promise<boolean> {
  if (isWeb) return false;
  return await LocalAuthentication.isEnrolledAsync();
}

/**
 * Get authentication type name for display
 */
export function getAuthTypeName(
  types: LocalAuthentication.AuthenticationType[]
): string {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'Face ID';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'Fingerprint';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'Iris';
  }
  return 'PIN';
}

export type BiometricType = 'FACE_ID' | 'TOUCH_ID' | 'FINGERPRINT' | 'NONE';

// Cache for biometric type
let cachedBiometricType: BiometricType | null = null;

/**
 * Get biometric type for UI display (synchronous with cached value)
 */
export function getBiometricType(): BiometricType {
  return cachedBiometricType ?? 'NONE';
}

/**
 * Initialize and cache biometric type
 */
export async function initializeBiometricType(): Promise<BiometricType> {
  if (isWeb) {
    cachedBiometricType = 'NONE';
    return cachedBiometricType;
  }
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    cachedBiometricType = 'FACE_ID';
  } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    // Check platform for Touch ID vs generic fingerprint
    cachedBiometricType = Platform.OS === 'ios' ? 'TOUCH_ID' : 'FINGERPRINT';
  } else {
    cachedBiometricType = 'NONE';
  }

  return cachedBiometricType;
}

/**
 * Initialize auth and check biometric availability
 */
export async function initializeAuth(): Promise<{
  publicKey: string;
  isNewUser: boolean;
  available: boolean;
}> {
  const publicKey = await getPublicKey();
  const publicKeyHex = bytesToHex(publicKey);

  // Check if this is a returning user
  const existingKey = await Store.getItemAsync(USER_INITIALIZED_KEY);
  const isNewUser = !existingKey;

  if (isNewUser) {
    await Store.setItemAsync(USER_INITIALIZED_KEY, 'true');
  }

  // Initialize biometric type
  await initializeBiometricType();

  if (isWeb) {
    return {
      publicKey: publicKeyHex,
      isNewUser,
      available: false,
    };
  }

  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();

  return {
    publicKey: publicKeyHex,
    isNewUser,
    available: hasHardware || isEnrolled,
  };
}
