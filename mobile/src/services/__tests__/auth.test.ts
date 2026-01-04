const mockSecureStore = {
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
};

const mockLocalAuth = {
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  AuthenticationType: {
    FACIAL_RECOGNITION: 1,
    FINGERPRINT: 2,
    IRIS: 3,
  },
};

const mockCrypto = {
  getPublicKey: jest.fn(async () => new Uint8Array([1, 2, 3])),
  bytesToHex: jest.fn(() => '010203'),
};

const localStorageMock = (() => {
  const store = new Map<string, string>();
  return {
    getItem: jest.fn((key: string) => store.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: jest.fn((key: string) => {
      store.delete(key);
    }),
    clear: jest.fn(() => store.clear()),
  };
})();

function loadAuthModule(platformOS: string) {
  jest.resetModules();
  jest.doMock('react-native', () => ({
    Platform: { OS: platformOS },
  }));
  jest.doMock('expo-secure-store', () => mockSecureStore);
  jest.doMock('expo-local-authentication', () => mockLocalAuth);
  jest.doMock('../crypto', () => mockCrypto);
  return require('../auth');
}

beforeEach(() => {
  mockSecureStore.getItemAsync.mockReset();
  mockSecureStore.setItemAsync.mockReset();
  mockLocalAuth.hasHardwareAsync.mockReset();
  mockLocalAuth.isEnrolledAsync.mockReset();
  mockLocalAuth.authenticateAsync.mockReset();
  mockLocalAuth.supportedAuthenticationTypesAsync.mockReset();
  mockCrypto.getPublicKey.mockClear();
  mockCrypto.bytesToHex.mockClear();
  localStorageMock.clear();
  global.localStorage = localStorageMock as unknown as Storage;
});

afterAll(() => {
  delete (global as { localStorage?: Storage }).localStorage;
});

describe('auth (web)', () => {
  it('initializes auth state without biometrics', async () => {
    const auth = loadAuthModule('web');
    const result = await auth.initializeAuth();

    expect(result.available).toBe(false);
    expect(result.isNewUser).toBe(true);
    expect(result.publicKey).toBe('010203');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('user_initialized', 'true');

    const second = await auth.initializeAuth();
    expect(second.isNewUser).toBe(false);
  });

  it('returns safe defaults on web', async () => {
    const auth = loadAuthModule('web');
    expect(await auth.authenticateWithBiometrics()).toBe(true);
    expect(await auth.getSupportedAuthTypes()).toEqual([]);
    expect(auth.getBiometricType()).toBe('NONE');
  });
});

describe('auth (native)', () => {
  it('falls back to device PIN when no biometric hardware is available', async () => {
    const auth = loadAuthModule('ios');
    mockLocalAuth.hasHardwareAsync.mockResolvedValue(false);
    mockLocalAuth.isEnrolledAsync.mockResolvedValue(false);
    mockLocalAuth.authenticateAsync.mockResolvedValue({ success: true });

    const ok = await auth.authenticateWithBiometrics();
    expect(ok).toBe(true);
    expect(mockLocalAuth.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Enter your device PIN to access Nullspace',
      disableDeviceFallback: false,
    });
  });

  it('requests enrollment when biometrics are available but not configured', async () => {
    const auth = loadAuthModule('ios');
    mockLocalAuth.hasHardwareAsync.mockResolvedValue(true);
    mockLocalAuth.isEnrolledAsync.mockResolvedValue(false);
    mockLocalAuth.authenticateAsync.mockResolvedValue({ success: true });

    const ok = await auth.authenticateWithBiometrics();
    expect(ok).toBe(true);
    expect(mockLocalAuth.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Set up biometrics or enter PIN to access Nullspace',
      disableDeviceFallback: false,
    });
  });

  it('uses biometrics when enrolled', async () => {
    const auth = loadAuthModule('ios');
    mockLocalAuth.hasHardwareAsync.mockResolvedValue(true);
    mockLocalAuth.isEnrolledAsync.mockResolvedValue(true);
    mockLocalAuth.authenticateAsync.mockResolvedValue({ success: true });

    const ok = await auth.authenticateWithBiometrics();
    expect(ok).toBe(true);
    expect(mockLocalAuth.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Authenticate to access Nullspace',
      fallbackLabel: 'Use PIN',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
  });

  it('derives biometric label names', async () => {
    const auth = loadAuthModule('ios');
    expect(auth.getAuthTypeName([mockLocalAuth.AuthenticationType.FACIAL_RECOGNITION])).toBe('Face ID');
    expect(auth.getAuthTypeName([mockLocalAuth.AuthenticationType.FINGERPRINT])).toBe('Fingerprint');
    expect(auth.getAuthTypeName([mockLocalAuth.AuthenticationType.IRIS])).toBe('Iris');
    expect(auth.getAuthTypeName([])).toBe('PIN');
  });
});
