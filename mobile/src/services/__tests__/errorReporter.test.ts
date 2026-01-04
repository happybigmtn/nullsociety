
describe('error reporter', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalDev = (global as typeof globalThis & { __DEV__?: boolean }).__DEV__;
  const originalAddEventListener = globalThis.addEventListener;
  const originalOnUnhandled = (globalThis as typeof globalThis & { onunhandledrejection?: unknown }).onunhandledrejection;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, EXPO_PUBLIC_ERROR_REPORT_URL: 'http://report.test' };
    global.fetch = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch;
    Object.defineProperty(global, '__DEV__', { configurable: true, value: true });
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    Object.defineProperty(global, '__DEV__', { configurable: true, value: originalDev });
    globalThis.addEventListener = originalAddEventListener;
    (globalThis as typeof globalThis & { onunhandledrejection?: unknown }).onunhandledrejection = originalOnUnhandled;
  });

  it('captures console errors once initialized', () => {
    const setGlobalHandler = jest.fn();
    const getGlobalHandler = jest.fn(() => undefined);
    (global as typeof globalThis & { ErrorUtils?: unknown }).ErrorUtils = {
      getGlobalHandler,
      setGlobalHandler,
    };

    const { initializeErrorReporter } = require('../errorReporter');
    initializeErrorReporter();

    console.error('boom');

    expect(setGlobalHandler).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
  });

  it('routes global errors and unhandled rejections', async () => {
    const previousHandler = jest.fn();
    let installedHandler: ((error: unknown, isFatal?: boolean) => void) | undefined;
    const setGlobalHandler = jest.fn((handler: (error: unknown, isFatal?: boolean) => void) => {
      installedHandler = handler;
    });
    const getGlobalHandler = jest.fn(() => previousHandler);

    (global as typeof globalThis & { ErrorUtils?: unknown }).ErrorUtils = {
      getGlobalHandler,
      setGlobalHandler,
    };

    let rejectionHandler: ((event: unknown) => void) | undefined;
    globalThis.addEventListener = jest.fn((event: string, handler: (event: unknown) => void) => {
      if (event === 'unhandledrejection') rejectionHandler = handler;
    });

    const { initializeErrorReporter } = require('../errorReporter');
    initializeErrorReporter();

    const error = new Error('kaboom');
    installedHandler?.(error, true);

    await Promise.resolve();
    expect(previousHandler).toHaveBeenCalledWith(error, true);
    expect(global.fetch).toHaveBeenCalled();

    rejectionHandler?.({ reason: new Error('rejected') });
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('skips initialization when not in dev', () => {
    Object.defineProperty(global, '__DEV__', { configurable: true, value: false });
    const { initializeErrorReporter } = require('../errorReporter');
    initializeErrorReporter();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
