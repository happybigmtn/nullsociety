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

jest.mock('@noble/curves/ed25519', () => ({
  ed25519: {
    utils: {
      randomPrivateKey: jest.fn(() => new Uint8Array([1, 2, 3, 4])),
    },
    getPublicKey: jest.fn(() => new Uint8Array([9, 9, 9])),
    sign: jest.fn(() => new Uint8Array([7, 7, 7])),
    verify: jest.fn(() => true),
  },
}));

jest.mock('../vault', () => ({
  getVaultPublicKeyHex: jest.fn(async () => null),
  isVaultEnabled: jest.fn(async () => false),
  getUnlockedVaultPrivateKey: jest.fn(() => null),
}));

describe('crypto service', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorageMock.clear();
    global.localStorage = localStorageMock as unknown as Storage;
  });

  afterAll(() => {
    delete (global as { localStorage?: Storage }).localStorage;
  });

  it('returns vault public key when available', async () => {
    const mockVault = require('../vault');
    mockVault.getVaultPublicKeyHex.mockResolvedValueOnce('010203');
    jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));

    const { getPublicKey } = require('../crypto');
    const key = await getPublicKey();
    expect(Array.from(key)).toEqual([1, 2, 3]);
  });

  it('creates a key pair on web storage and signs messages', async () => {
    jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));

    const { getPublicKey, signMessage, hasKeyPair } = require('../crypto');
    const pub = await getPublicKey();
    expect(Array.from(pub)).toEqual([9, 9, 9]);
    expect(await hasKeyPair()).toBe(true);

    const signature = await signMessage(new Uint8Array([4]));
    expect(Array.from(signature)).toEqual([7, 7, 7]);
  });

  it('uses vault signing when enabled', async () => {
    const mockVault = require('../vault');
    mockVault.isVaultEnabled.mockResolvedValueOnce(true);
    mockVault.getUnlockedVaultPrivateKey.mockReturnValueOnce(new Uint8Array([4, 4]));

    jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));

    const { signMessage } = require('../crypto');
    const signature = await signMessage(new Uint8Array([1]));
    expect(Array.from(signature)).toEqual([7, 7, 7]);
  });
});
