const mockExpoGetRandomValues = jest.fn();

jest.mock('expo-crypto', () => ({
  getRandomValues: (array: Uint8Array) => mockExpoGetRandomValues(array),
}));

describe('cryptoPolyfill', () => {
  const originalCrypto = global.crypto;

  afterEach(() => {
    global.crypto = originalCrypto;
    mockExpoGetRandomValues.mockReset();
    jest.resetModules();
  });

  it('installs crypto.getRandomValues when missing', () => {
    delete (global as { crypto?: Crypto }).crypto;
    require('../cryptoPolyfill');

    expect(global.crypto).toBeDefined();
    const target = new Uint8Array([1, 2, 3]);
    global.crypto.getRandomValues(target);
    expect(mockExpoGetRandomValues).toHaveBeenCalledWith(target);
  });

  it('fills missing getRandomValues on existing crypto', () => {
    global.crypto = {} as Crypto;
    require('../cryptoPolyfill');

    expect(global.crypto.getRandomValues).toBeDefined();
    const target = new Uint8Array([4, 5, 6]);
    global.crypto.getRandomValues(target);
    expect(mockExpoGetRandomValues).toHaveBeenCalledWith(target);
  });
});
