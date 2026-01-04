import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_CHALLENGE_PREFIX,
  EVM_LINK_PREFIX,
  buildAiPrompt,
  buildAuthMessage,
  buildEvmLinkMessage,
  bytesToHex,
  extractSecretValue,
  getMemberTiers,
  hasActiveEntitlement,
  hexToBytes,
  isHex,
  normalizeHex,
  parseChainId,
  parseLimit,
} from '../src/utils.js';

test('normalizeHex trims, lowercases, and strips 0x', () => {
  assert.equal(normalizeHex(' 0xAbCd '), 'abcd');
});

test('isHex validates hex strings with optional length', () => {
  assert.equal(isHex('deadbeef'), true);
  assert.equal(isHex('deadbeef', 8), true);
  assert.equal(isHex('deadbeef', 4), false);
  assert.equal(isHex('not-hex'), false);
});

test('parseChainId rejects invalid and accepts positive integers', () => {
  assert.equal(parseChainId('0'), null);
  assert.equal(parseChainId('-1'), null);
  assert.equal(parseChainId('abc'), null);
  assert.equal(parseChainId('1'), 1);
});

test('buildAuthMessage includes prefix and challenge bytes', () => {
  const challengeHex = 'abcd';
  const msg = buildAuthMessage(challengeHex);
  const expected = Buffer.concat([
    Buffer.from(AUTH_CHALLENGE_PREFIX, 'utf8'),
    Buffer.from(challengeHex, 'hex'),
  ]);
  assert.equal(msg.toString('hex'), expected.toString('hex'));
});

test('buildEvmLinkMessage formats required fields', () => {
  const message = buildEvmLinkMessage({
    origin: 'https://example.com',
    address: '0xabc',
    chainId: 1,
    userId: 'user-1',
    challenge: 'nonce',
  });
  assert.ok(message.startsWith(EVM_LINK_PREFIX));
  assert.ok(message.includes('origin:https://example.com'));
  assert.ok(message.includes('address:0xabc'));
  assert.ok(message.includes('chainId:1'));
  assert.ok(message.includes('userId:user-1'));
  assert.ok(message.includes('nonce:nonce'));
});

test('buildAiPrompt includes key fields', () => {
  const prompt = buildAiPrompt({
    gameType: 'blackjack',
    playerCards: [{ rank: 'A' }],
    dealerUpCard: { rank: 'K' },
    history: [],
  });
  assert.ok(prompt.includes('Game: blackjack'));
  assert.ok(prompt.includes('Player cards:'));
});

test('extractSecretValue handles JSON and raw values', () => {
  assert.equal(extractSecretValue(''), null);
  assert.equal(extractSecretValue('  abc  '), 'abc');
  assert.equal(
    extractSecretValue(JSON.stringify({ adminKeyHex: 'deadbeef' })),
    'deadbeef',
  );
});

test('parseLimit clamps and falls back', () => {
  assert.equal(parseLimit(undefined, 10), 10);
  assert.equal(parseLimit('0', 10), 10);
  assert.equal(parseLimit('300', 10), 255);
  assert.equal(parseLimit('42', 10), 42);
});

test('getMemberTiers splits and trims', () => {
  assert.deepEqual(getMemberTiers(' gold, ,silver '), ['gold', 'silver']);
});

test('hasActiveEntitlement respects tiers and status', () => {
  const entitlements = [
    { tier: 'gold', status: 'inactive' },
    { tier: 'silver', status: 'active' },
  ];
  assert.equal(hasActiveEntitlement(entitlements, ['silver']), true);
  assert.equal(hasActiveEntitlement(entitlements, ['gold']), false);
});

test('hexToBytes and bytesToHex round-trip', () => {
  const hex = 'deadbeef';
  const bytes = hexToBytes(hex);
  assert.equal(bytesToHex(bytes), hex);
});
