export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const resolveLogLevel = (): LogLevel => {
  const raw = (
    process.env.GATEWAY_LOG_LEVEL ??
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug')
  )
    .toString()
    .trim()
    .toLowerCase();

  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }

  return 'info';
};

const MIN_LEVEL = resolveLogLevel();
const MIN_RANK = LEVELS[MIN_LEVEL];

const shouldLog = (level: LogLevel): boolean => LEVELS[level] >= MIN_RANK;

export const logDebug = (...args: unknown[]): void => {
  if (shouldLog('debug')) {
    console.debug(...args);
  }
};

export const logInfo = (...args: unknown[]): void => {
  if (shouldLog('info')) {
    console.log(...args);
  }
};

export const logWarn = (...args: unknown[]): void => {
  if (shouldLog('warn')) {
    console.warn(...args);
  }
};

export const logError = (...args: unknown[]): void => {
  if (shouldLog('error')) {
    console.error(...args);
  }
};
