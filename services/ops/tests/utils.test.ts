import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDayKey, formatSeasonKey, formatWeekKey, normalizeHex } from '../src/utils.js';

test('normalizeHex trims, lowercases, and strips 0x', () => {
  assert.equal(normalizeHex(' 0xAbCd '), 'abcd');
});

test('formatDayKey uses UTC date parts', () => {
  const ts = Date.UTC(2024, 0, 4); // 2024-01-04
  assert.equal(formatDayKey(ts), '2024-01-04');
});

test('formatSeasonKey uses UTC year-month', () => {
  const ts = Date.UTC(2024, 11, 31); // 2024-12-31
  assert.equal(formatSeasonKey(ts), '2024-12');
});

test('formatWeekKey returns ISO week year', () => {
  const ts = Date.UTC(2024, 0, 4); // Thursday of ISO week 1
  assert.equal(formatWeekKey(ts), '2024-W01');
  const tsEnd = Date.UTC(2020, 11, 31); // 2020-12-31 (ISO week 53)
  assert.equal(formatWeekKey(tsEnd), '2020-W53');
});
