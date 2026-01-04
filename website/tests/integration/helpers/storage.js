export function installLocalStorageMock() {
  globalThis.localStorage = {
    storage: {},
    getItem(key) {
      return this.storage[key] || null;
    },
    setItem(key, value) {
      this.storage[key] = value;
    },
    removeItem(key) {
      delete this.storage[key];
    },
    clear() {
      this.storage = {};
    },
    get length() {
      return Object.keys(this.storage).length;
    },
    key(index) {
      return Object.keys(this.storage)[index];
    },
  };
  return globalThis.localStorage;
}
