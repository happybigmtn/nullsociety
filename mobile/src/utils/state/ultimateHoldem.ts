import type { Card } from '../../types';
import { decodeCardId, isHiddenCard } from '../cards';
import { readU64BE } from './shared';

export interface UltimateHoldemStateUpdate {
  playerCards: Card[];
  communityCards: Card[];
  dealerCards: Card[];
  stage: 'betting' | 'preflop' | 'flop' | 'river' | 'showdown' | 'result';
  tripsBet: number;
}

export function parseUltimateHoldemState(stateBlob: Uint8Array): UltimateHoldemStateUpdate | null {
  if (stateBlob.length < 40 || stateBlob[0] !== 3) {
    return null;
  }
  const stageByte = stateBlob[1];
  const playerRaw = stateBlob.slice(2, 4);
  const communityRaw = stateBlob.slice(4, 9);
  const dealerRaw = stateBlob.slice(9, 11);

  const playerCards: Card[] = [];
  for (const cardId of playerRaw) {
    if (!isHiddenCard(cardId)) {
      const card = decodeCardId(cardId);
      if (card) playerCards.push(card);
    }
  }

  const communityCards: Card[] = [];
  for (const cardId of communityRaw) {
    if (!isHiddenCard(cardId)) {
      const card = decodeCardId(cardId);
      if (card) communityCards.push(card);
    }
  }

  const dealerCards: Card[] = [];
  for (const cardId of dealerRaw) {
    if (!isHiddenCard(cardId)) {
      const card = decodeCardId(cardId);
      if (card) dealerCards.push(card);
    }
  }

  const view = new DataView(stateBlob.buffer, stateBlob.byteOffset, stateBlob.byteLength);
  const tripsBet = Number(readU64BE(view, 16));

  const stage: UltimateHoldemStateUpdate['stage'] =
    stageByte === 1
      ? 'preflop'
      : stageByte === 2
        ? 'flop'
        : stageByte === 3
          ? 'river'
          : stageByte === 4
            ? 'showdown'
            : stageByte === 5
              ? 'result'
              : 'betting';

  return {
    playerCards,
    communityCards,
    dealerCards,
    stage,
    tripsBet: Number.isFinite(tripsBet) ? tripsBet : 0,
  };
}

