import { describe, it, expect } from 'vitest';
import {
  decodeCard,
  decodeGameResult,
  decodeBlackjackState,
} from '../src/decode.js';

const toBuffer = (bytes: number[]): Uint8Array => new Uint8Array(bytes);

describe('protocol decode helpers', () => {
  it('decodes a card', () => {
    const data = toBuffer([1, 12, 1]); // hearts, K, faceUp
    const card = decodeCard(data, 0);
    expect(card).toEqual({ suit: 'hearts', rank: 'K', faceUp: true });
  });

  it('decodes a game result', () => {
    const buffer = new ArrayBuffer(19 + 5);
    const view = new DataView(buffer);
    view.setBigUint64(0, 42n, true);
    view.setUint8(8, 2); // gameType
    view.setUint8(9, 1); // won
    view.setBigUint64(10, 500n, true);
    view.setUint8(18, 5);
    const bytes = new Uint8Array(buffer);
    bytes.set(new TextEncoder().encode('hello'), 19);

    const result = decodeGameResult(bytes);
    expect(result.sessionId).toBe(42n);
    expect(result.gameType).toBe(2);
    expect(result.won).toBe(true);
    expect(result.payout).toBe(500n);
    expect(result.message).toBe('hello');
  });

  it('decodes a blackjack state payload', () => {
    const buffer = new ArrayBuffer(8 + 1 + 3 + 1 + 3 + 4);
    const view = new DataView(buffer);
    let offset = 0;
    view.setBigUint64(offset, 7n, true);
    offset += 8;
    view.setUint8(offset++, 1); // player card count
    const bytes = new Uint8Array(buffer);
    bytes.set([0, 0, 1], offset); // spades A faceUp
    offset += 3;
    view.setUint8(offset++, 1); // dealer card count
    bytes.set([2, 9, 0], offset); // diamonds 10 faceDown
    offset += 3;
    view.setUint8(offset++, 21); // player total
    view.setUint8(offset++, 10); // dealer total
    view.setUint8(offset++, 1); // stage = playing
    view.setUint8(offset, 0b1011); // canHit, canStand, canSplit

    const state = decodeBlackjackState(bytes);
    expect(state.sessionId).toBe(7n);
    expect(state.playerCards).toHaveLength(1);
    expect(state.dealerCards).toHaveLength(1);
    expect(state.playerTotal).toBe(21);
    expect(state.dealerTotal).toBe(10);
    expect(state.stage).toBe('playing');
    expect(state.canHit).toBe(true);
    expect(state.canStand).toBe(true);
    expect(state.canSplit).toBe(true);
    expect(state.canDouble).toBe(false);
  });

  it('throws on malformed decode input', () => {
    expect(() => decodeCard(new Uint8Array([]), 0)).toThrow();
    expect(() => decodeGameResult(new Uint8Array([1, 2, 3]))).toThrow();
  });
});
