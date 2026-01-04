
describe('entitlements service', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('returns empty list when auth base is not configured', async () => {
    const { fetchMobileEntitlements } = require('../entitlements');
    await expect(fetchMobileEntitlements('pub')).resolves.toEqual([]);
  });

  it('fetches challenge and entitlements', async () => {
    process.env.EXPO_PUBLIC_AUTH_URL = 'https://auth.test';

    jest.doMock('../crypto', () => ({
      signMessage: jest.fn(async () => new Uint8Array([1, 2, 3, 4])),
    }));

    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ challengeId: 'c1', challenge: '0a0b' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entitlements: [{ tier: 'vip', status: 'active', source: 'test', startsAtMs: 1 }] }),
      });

    const { fetchMobileEntitlements } = require('../entitlements');
    const result = await fetchMobileEntitlements('pubkey');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0].tier).toBe('vip');
  });
});
