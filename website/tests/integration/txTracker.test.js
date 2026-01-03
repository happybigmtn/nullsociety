import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  clearActivity,
  getActivityItems,
  logActivity,
  trackTxConfirmed,
  trackTxFailed,
  trackTxSubmitted,
} from '../../src/services/txTracker.js';

// Mock localStorage for Node.js environment
global.localStorage = {
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

describe('txTracker', () => {
  let realNow;
  let t;

  beforeEach(() => {
    realNow = Date.now;
    t = 1_700_000_000_000;
    Date.now = () => (t += 1_000);
    localStorage.clear();
    clearActivity();
  });

  afterEach(() => {
    Date.now = realNow;
  });

  test('logActivity appends log entries', () => {
    logActivity('economy', 'Connected');
    const items = getActivityItems('economy');
    assert.equal(items.length, 1);
    assert.equal(items[0].type, 'log');
    assert.equal(items[0].message, 'Connected');
    assert.equal(items[0].level, 'info');
  });

  test('trackTxSubmitted appends pending tx', () => {
    trackTxSubmitted({ surface: 'economy', kind: 'swap', message: 'Submitted swap', pubkeyHex: 'abc', nonce: 1 });
    const items = getActivityItems('economy');
    assert.equal(items.length, 1);
    assert.equal(items[0].type, 'tx');
    assert.equal(items[0].status, 'submitted');
    assert.equal(items[0].kind, 'swap');
    assert.equal(items[0].nonce, 1);
  });

  test('trackTxConfirmed updates latest pending and bubbles by updatedTs', () => {
    trackTxSubmitted({ surface: 'economy', kind: 'swap', message: 'Submitted swap', pubkeyHex: 'abc', nonce: 1 });
    trackTxSubmitted({ surface: 'economy', kind: 'borrow', message: 'Submitted borrow', pubkeyHex: 'abc', nonce: 2 });

    // Confirm the older swap; it should bubble to the top due to updatedTs sorting.
    trackTxConfirmed({ surface: 'economy', kind: 'swap', finalMessage: 'Swap executed', pubkeyHex: 'abc' });

    const items = getActivityItems('economy');
    assert.equal(items[0].type, 'tx');
    assert.equal(items[0].kind, 'swap');
    assert.equal(items[0].status, 'confirmed');
    assert.equal(items[0].finalMessage, 'Swap executed');
  });

  test('trackTxFailed updates latest pending for player', () => {
    trackTxSubmitted({ surface: 'staking', kind: 'stake', message: 'Submitted stake', pubkeyHex: '0xabc', nonce: 1 });
    trackTxFailed({ surface: 'staking', finalMessage: 'Rejected', pubkeyHex: 'abc', error: 'Rejected' });

    const items = getActivityItems('staking');
    assert.equal(items[0].type, 'tx');
    assert.equal(items[0].kind, 'stake');
    assert.equal(items[0].status, 'failed');
    assert.equal(items[0].finalMessage, 'Rejected');
    assert.equal(items[0].error, 'Rejected');
  });

  test('trackTxConfirmed creates confirmed entry when no pending exists', () => {
    trackTxConfirmed({ surface: 'economy', kind: 'swap', finalMessage: 'Swap executed', pubkeyHex: 'abc' });
    const items = getActivityItems('economy');
    assert.equal(items.length, 1);
    assert.equal(items[0].type, 'tx');
    assert.equal(items[0].status, 'confirmed');
    assert.equal(items[0].message, 'Swap executed');
  });

  test('clearActivity can clear a single surface', () => {
    logActivity('economy', 'Connected');
    logActivity('staking', 'Connected');
    clearActivity('economy');
    assert.equal(getActivityItems('economy').length, 0);
    assert.equal(getActivityItems('staking').length, 1);
  });
});

