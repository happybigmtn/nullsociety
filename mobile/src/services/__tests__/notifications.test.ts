const mockGetString = jest.fn();
const mockSetString = jest.fn();

const mockNotifications = {
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  AndroidImportance: { DEFAULT: 'default' },
};

const loadModule = (options: {
  isDevice?: boolean;
  appOwnership?: string;
  executionEnvironment?: string;
  platformOS?: string;
  cachedToken?: string;
  permissionsStatus?: string;
  requestStatus?: string;
}) => {
  jest.resetModules();
  mockNotifications.getPermissionsAsync.mockResolvedValue({
    status: options.permissionsStatus ?? 'granted',
  });
  mockNotifications.requestPermissionsAsync.mockResolvedValue({
    status: options.requestStatus ?? 'granted',
  });
  mockGetString.mockReturnValue(options.cachedToken ?? '');

  process.env.EXPO_PUBLIC_OPS_URL = 'https://ops.example.com';

  jest.doMock('expo-device', () => ({
    isDevice: options.isDevice ?? true,
  }));
  jest.doMock('expo-constants', () => ({
    appOwnership: options.appOwnership ?? 'standalone',
    expoConfig: {
      extra: { eas: { projectId: 'test-project' } },
    },
    easConfig: { projectId: 'test-project' },
    executionEnvironment: options.executionEnvironment,
  }));
  jest.doMock('expo-notifications', () => mockNotifications);
  jest.doMock('react-native', () => ({
    Platform: { OS: options.platformOS ?? 'ios' },
  }));
  jest.doMock('../storage', () => ({
    STORAGE_KEYS: { PUSH_TOKEN: 'notifications.push_token' },
    getString: (...args: unknown[]) => mockGetString(...args),
    setString: (...args: unknown[]) => mockSetString(...args),
  }));

  let moduleExports: typeof import('../notifications');
  jest.isolateModules(() => {
    moduleExports = require('../notifications');
  });
  return moduleExports!;
};

describe('notifications service', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockGetString.mockReset();
    mockSetString.mockReset();
    mockNotifications.getPermissionsAsync.mockClear();
    mockNotifications.requestPermissionsAsync.mockClear();
    mockNotifications.setNotificationChannelAsync.mockClear();
    mockNotifications.getExpoPushTokenAsync.mockClear();
    global.fetch = jest.fn(async () => ({ ok: true })) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns null when running on simulator', async () => {
    const { initializeNotifications } = loadModule({ isDevice: false });
    const token = await initializeNotifications();
    expect(token).toBeNull();
  });

  it('returns null in Expo Go', async () => {
    const { initializeNotifications } = loadModule({ appOwnership: 'expo' });
    const token = await initializeNotifications();
    expect(token).toBeNull();
  });

  it('reuses cached token and registers it', async () => {
    const { initializeNotifications } = loadModule({ cachedToken: 'cached-token' });
    const token = await initializeNotifications('pubkey');

    expect(token).toBe('cached-token');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://ops.example.com/push/register',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('returns null when permissions are denied', async () => {
    const { initializeNotifications } = loadModule({
      permissionsStatus: 'denied',
      requestStatus: 'denied',
    });
    const token = await initializeNotifications();
    expect(token).toBeNull();
    expect(mockNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('requests token, sets channel on android, and stores token', async () => {
    const { initializeNotifications } = loadModule({ platformOS: 'android' });
    const token = await initializeNotifications('pubkey');

    expect(token).toBe('ExponentPushToken[test]');
    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ importance: mockNotifications.AndroidImportance.DEFAULT })
    );
    expect(mockSetString).toHaveBeenCalledWith('notifications.push_token', 'ExponentPushToken[test]');
  });
});
