
describe('storage service', () => {
  const originalDev = (global as typeof globalThis & { __DEV__?: boolean }).__DEV__;
  const originalCrypto = global.crypto;

  const buildLocalStorage = () => {
    const store = new Map<string, string>();
    const storage: Record<string, unknown> = {};
    return Object.assign(storage, {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
        (storage as Record<string, string>)[key] = value;
      },
      removeItem: (key: string) => {
        store.delete(key);
        delete (storage as Record<string, string>)[key];
      },
      clear: () => {
        store.forEach((_value, key) => {
          delete (storage as Record<string, string>)[key];
        });
        store.clear();
      },
    });
  };

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
    global.localStorage = buildLocalStorage() as unknown as Storage;
    Object.defineProperty(global, '__DEV__', {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(global, '__DEV__', {
      configurable: true,
      value: originalDev,
    });
    global.crypto = originalCrypto;
  });

  it('stores and retrieves values on web', async () => {
    const storage = require('../storage');
    await storage.initializeStorage();

    storage.setBoolean(storage.STORAGE_KEYS.HAPTICS_ENABLED, true);
    storage.setString(storage.STORAGE_KEYS.LAST_GAME, 'hi_lo');
    storage.setNumber(storage.STORAGE_KEYS.CACHED_BALANCE, 250);

    expect(storage.getBoolean(storage.STORAGE_KEYS.HAPTICS_ENABLED)).toBe(true);
    expect(storage.getString(storage.STORAGE_KEYS.LAST_GAME)).toBe('hi_lo');
    expect(storage.getNumber(storage.STORAGE_KEYS.CACHED_BALANCE)).toBe(250);
  });

  it('handles object parsing and clearing', async () => {
    const storage = require('../storage');
    await storage.initializeStorage();

    storage.setObject('object.test', { value: 12 });
    expect(storage.getObject('object.test', { value: 0 })).toEqual({ value: 12 });

    storage.setString('object.bad', '{bad json');
    expect(storage.getObject('object.bad', { ok: false })).toEqual({ ok: false });

    expect(storage.hasKey('object.test')).toBe(true);
    storage.deleteKey('object.test');
    expect(storage.hasKey('object.test')).toBe(false);

    storage.setString('misc.key', 'value');
    storage.clearAll();
    expect(storage.hasKey('misc.key')).toBe(false);
  });

  it('marks and resets tutorial completion', async () => {
    const storage = require('../storage');
    await storage.initializeStorage();

    storage.markTutorialCompleted('hilo');
    expect(storage.isTutorialCompleted('hilo')).toBe(true);

    storage.resetTutorial('hilo');
    expect(storage.isTutorialCompleted('hilo')).toBe(false);

    storage.markTutorialCompleted('blackjack');
    storage.resetAllTutorials();
    expect(storage.isTutorialCompleted('blackjack')).toBe(false);
  });

  it('throws when native storage is accessed before init', () => {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
    const storage = require('../storage');
    expect(() => storage.getStorage()).toThrow('Storage not initialized');
  });

  it('initializes native storage with secure store key', async () => {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));

    const getItemAsync = jest.fn(async () => null);
    const setItemAsync = jest.fn(async () => undefined);
    jest.doMock('expo-secure-store', () => ({
      getItemAsync,
      setItemAsync,
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when_unlocked',
    }));

    const mmkv = jest.fn(() => ({
      getBoolean: jest.fn(),
      getString: jest.fn(),
      getNumber: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      contains: jest.fn(),
      clearAll: jest.fn(),
    }));
    jest.doMock('react-native-mmkv', () => ({ MMKV: mmkv }));

    global.crypto = {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.forEach((_value, index) => {
          bytes[index] = (index + 1) % 255;
        });
        return bytes;
      },
    } as typeof crypto;

    const storage = require('../storage');
    const instance = await storage.initializeStorage();

    expect(instance).toBeDefined();
    expect(getItemAsync).toHaveBeenCalled();
    expect(setItemAsync).toHaveBeenCalled();
    expect(mmkv).toHaveBeenCalledWith(expect.objectContaining({ id: 'nullspace-storage' }));
  });
});
