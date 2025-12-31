const IS_DEV = Boolean(import.meta.env?.DEV);

export const logDebug = (...args: unknown[]): void => {
  if (IS_DEV) {
    console.debug(...args);
  }
};
