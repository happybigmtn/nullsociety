import type { AnalyticsEvent } from '../analytics';

describe('analytics service', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    global.fetch = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch;
    if (!global.crypto) {
      global.crypto = require('crypto').webcrypto;
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('sends analytics events when configured', async () => {
    process.env.EXPO_PUBLIC_OPS_URL = 'https://ops.test';

    jest.doMock('../storage', () => ({
      initializeStorage: jest.fn(async () => undefined),
      getString: jest.fn(() => ''),
      setString: jest.fn(),
      STORAGE_KEYS: { ANALYTICS_DEVICE_ID: 'analytics.device_id' },
    }));

    const { initAnalytics, track } = require('../analytics');

    await initAnalytics();
    await track(' test_event ', { value: 1 });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://ops.test/analytics/events');

    const body = JSON.parse(options.body);
    const event: AnalyticsEvent = body.events[0];
    expect(event.name).toBe('test_event');
    expect(body.actor.platform).toBeDefined();
  });

  it('skips events with empty names or missing config', async () => {
    process.env.EXPO_PUBLIC_OPS_URL = '';

    jest.doMock('../storage', () => ({
      initializeStorage: jest.fn(async () => undefined),
      getString: jest.fn(() => ''),
      setString: jest.fn(),
      STORAGE_KEYS: { ANALYTICS_DEVICE_ID: 'analytics.device_id' },
    }));

    const { track } = require('../analytics');
    await track('');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
