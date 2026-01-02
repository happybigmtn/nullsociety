import { Platform } from 'react-native';
import Constants from 'expo-constants';

const DEFAULT_PORT = 9079;
const MAX_STACK = 6000;
const MAX_MESSAGE = 2000;
const MAX_CONSOLE = 2000;
let initialized = false;
let reporting = false;

const safeStringify = (value: unknown, limit: number): string => {
  if (typeof value === 'string') return value.slice(0, limit);
  if (value instanceof Error) {
    const message = value.message ?? String(value);
    const stack = value.stack ?? '';
    return `${value.name}: ${message}${stack ? `\n${stack}` : ''}`.slice(0, limit);
  }
  try {
    return JSON.stringify(value).slice(0, limit);
  } catch {
    return String(value).slice(0, limit);
  }
};

const getDevHost = (): string | null => {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost ||
    (Constants.manifest as { debuggerHost?: string } | undefined)?.debuggerHost ||
    '';
  if (!hostUri) return null;
  let host = hostUri;
  if (host.includes('://')) {
    const [, rest] = host.split('://');
    host = rest ?? '';
  }
  host = host.split('/')[0] ?? '';
  host = host.split(':')[0] ?? '';
  return host || null;
};

const getReporterBase = (): string | null => {
  const configured = process.env.EXPO_PUBLIC_ERROR_REPORT_URL;
  if (configured) return configured;
  if (!__DEV__) return null;
  const host = getDevHost();
  if (!host) return null;
  return `http://${host}:${DEFAULT_PORT}`;
};

const reportPayload = async (payload: Record<string, unknown>): Promise<void> => {
  const base = getReporterBase();
  if (!base) return;
  if (reporting) return;
  reporting = true;
  try {
    await fetch(`${base}/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Ignore reporting errors
  } finally {
    reporting = false;
  }
};

const buildBasePayload = () => ({
  timestamp: Date.now(),
  platform: Platform.OS,
  platformVersion: Platform.Version,
  appOwnership: Constants.appOwnership,
  runtimeVersion: Constants.expoConfig?.runtimeVersion ?? null,
  appVersion: Constants.expoConfig?.version ?? null,
  sdkVersion: Constants.expoConfig?.sdkVersion ?? null,
  buildNumber: Constants.expoConfig?.ios?.buildNumber ?? null,
  androidVersionCode: Constants.expoConfig?.android?.versionCode ?? null,
});

const reportError = (error: unknown, isFatal: boolean) => {
  const payload = {
    ...buildBasePayload(),
    type: 'error',
    isFatal,
    message: safeStringify(error, MAX_MESSAGE),
    stack: error instanceof Error ? (error.stack ?? '').slice(0, MAX_STACK) : null,
  };
  void reportPayload(payload);
};

const reportConsole = (level: 'error' | 'warn', args: unknown[]) => {
  const payload = {
    ...buildBasePayload(),
    type: 'console',
    level,
    message: args.map((arg) => safeStringify(arg, MAX_CONSOLE)).join(' '),
  };
  void reportPayload(payload);
};

export function initializeErrorReporter(): void {
  if (!__DEV__) return;
  if (initialized) return;
  initialized = true;

  const globalAny = globalThis as typeof globalThis & {
    ErrorUtils?: {
      getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    };
  };

  const errorUtils = globalAny.ErrorUtils;
  const previousHandler = errorUtils?.getGlobalHandler?.();

  errorUtils?.setGlobalHandler?.((error: unknown, isFatal?: boolean) => {
    reportError(error, Boolean(isFatal));
    if (previousHandler) {
      previousHandler(error, isFatal);
    }
  });

  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('unhandledrejection', (event: unknown) => {
      const reason = (event as { reason?: unknown })?.reason ?? event;
      reportError(reason, false);
    });
  } else if ('onunhandledrejection' in globalThis) {
    (globalThis as typeof globalThis & { onunhandledrejection?: (event: unknown) => void }).onunhandledrejection = (event: unknown) => {
      const reason = (event as { reason?: unknown })?.reason ?? event;
      reportError(reason, false);
    };
  }

  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = (...args: unknown[]) => {
    reportConsole('error', args);
    originalError(...args);
  };

  console.warn = (...args: unknown[]) => {
    reportConsole('warn', args);
    originalWarn(...args);
  };
}
