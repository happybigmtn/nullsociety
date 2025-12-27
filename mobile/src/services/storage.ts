/**
 * Storage service using MMKV for high-performance local storage
 * With encryption key stored in SecureStore
 */
import { MMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';

const ENCRYPTION_KEY_ID = 'mmkv_encryption_key';

let storageInstance: MMKV | null = null;

// Re-export storage instance for direct access (after initialization)
export { storageInstance as storage };

/**
 * Get or create encryption key from SecureStore
 */
async function getOrCreateEncryptionKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(ENCRYPTION_KEY_ID);
  if (!key) {
    // Generate a random 32-byte key
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    key = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    await SecureStore.setItemAsync(ENCRYPTION_KEY_ID, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  return key;
}

/**
 * Initialize encrypted MMKV storage
 * Must be called before using any storage functions
 */
export async function initializeStorage(): Promise<MMKV> {
  if (storageInstance) return storageInstance;
  const encryptionKey = await getOrCreateEncryptionKey();
  storageInstance = new MMKV({
    id: 'nullspace-storage',
    encryptionKey,
  });
  return storageInstance;
}

/**
 * Get the storage instance
 * Throws if storage not initialized
 */
export function getStorage(): MMKV {
  if (!storageInstance) {
    throw new Error('Storage not initialized. Call initializeStorage first.');
  }
  return storageInstance;
}

// Type-safe storage keys
export const STORAGE_KEYS = {
  // Auth
  SESSION_ACTIVE: 'auth.session_active',

  // Game settings
  HAPTICS_ENABLED: 'settings.haptics_enabled',
  SOUND_ENABLED: 'settings.sound_enabled',
  TUTORIAL_COMPLETED: 'settings.tutorial_completed',

  // Per-game tutorial completion
  TUTORIAL_HILO: 'tutorial.hilo',
  TUTORIAL_BLACKJACK: 'tutorial.blackjack',
  TUTORIAL_ROULETTE: 'tutorial.roulette',
  TUTORIAL_CRAPS: 'tutorial.craps',
  TUTORIAL_CASINO_WAR: 'tutorial.casino_war',
  TUTORIAL_VIDEO_POKER: 'tutorial.video_poker',
  TUTORIAL_BACCARAT: 'tutorial.baccarat',
  TUTORIAL_SIC_BO: 'tutorial.sic_bo',
  TUTORIAL_THREE_CARD_POKER: 'tutorial.three_card_poker',
  TUTORIAL_ULTIMATE_HOLDEM: 'tutorial.ultimate_holdem',

  // User preferences
  SELECTED_CHIP: 'user.selected_chip',
  LAST_GAME: 'user.last_game',

  // Cache
  CACHED_BALANCE: 'cache.balance',
  LAST_SYNC: 'cache.last_sync',
} as const;

/**
 * Get a boolean value from storage
 */
export function getBoolean(key: string, defaultValue = false): boolean {
  return getStorage().getBoolean(key) ?? defaultValue;
}

/**
 * Set a boolean value in storage
 */
export function setBoolean(key: string, value: boolean): void {
  getStorage().set(key, value);
}

/**
 * Get a string value from storage
 */
export function getString(key: string, defaultValue = ''): string {
  return getStorage().getString(key) ?? defaultValue;
}

/**
 * Set a string value in storage
 */
export function setString(key: string, value: string): void {
  getStorage().set(key, value);
}

/**
 * Get a number value from storage
 */
export function getNumber(key: string, defaultValue = 0): number {
  return getStorage().getNumber(key) ?? defaultValue;
}

/**
 * Set a number value in storage
 */
export function setNumber(key: string, value: number): void {
  getStorage().set(key, value);
}

/**
 * Get a JSON object from storage
 */
export function getObject<T>(key: string, defaultValue: T): T {
  const json = getStorage().getString(key);
  if (!json) return defaultValue;
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Set a JSON object in storage
 */
export function setObject<T>(key: string, value: T): void {
  getStorage().set(key, JSON.stringify(value));
}

/**
 * Delete a key from storage
 */
export function deleteKey(key: string): void {
  getStorage().delete(key);
}

/**
 * Check if a key exists in storage
 */
export function hasKey(key: string): boolean {
  return getStorage().contains(key);
}

/**
 * Clear all storage
 */
export function clearAll(): void {
  getStorage().clearAll();
}

/**
 * Check if tutorial is completed for a game
 */
export function isTutorialCompleted(gameId: string): boolean {
  return getBoolean(`tutorial.${gameId}`, false);
}

/**
 * Mark tutorial as completed for a game
 */
export function markTutorialCompleted(gameId: string): void {
  setBoolean(`tutorial.${gameId}`, true);
}

/**
 * Reset tutorial for a game
 */
export function resetTutorial(gameId: string): void {
  deleteKey(`tutorial.${gameId}`);
}

/**
 * Reset all tutorials
 */
export function resetAllTutorials(): void {
  Object.values(STORAGE_KEYS)
    .filter((key) => key.startsWith('tutorial.'))
    .forEach((key) => deleteKey(key));
}
