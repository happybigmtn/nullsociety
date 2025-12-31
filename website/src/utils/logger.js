// JS shim for modules that can't import TypeScript directly.
const IS_DEV = Boolean(import.meta.env?.DEV);

export const logDebug = (...args) => {
  if (IS_DEV) {
    console.debug(...args);
  }
};
