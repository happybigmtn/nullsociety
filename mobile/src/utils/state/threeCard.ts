import type { Card } from '../../types';
import { decodeCardId, isHiddenCard } from '../cards';
import { readU64BE } from './shared';

export interface ThreeCardStateUpdate {
  playerCards: Card[];
  dealerCards: Card[];
  stage: 'betting' | 'decision' | 'awaiting' | 'complete';
  pairPlusBet: number;
}

export function parseThreeCardState(stateBlob: Uint8Array): ThreeCardStateUpdate | null {
  if (stateBlob.length < 32 || stateBlob[0] !== 3) {
    return null;
  }
  const stageByte = stateBlob[1];
  const playerRaw = stateBlob.slice(2, 5);
  const dealerRaw = stateBlob.slice(5, 8);

  const playerCards: Card[] = [];
  for (const cardId of playerRaw) {
    if (!isHiddenCard(cardId)) {
      const card = decodeCardId(cardId);
      if (card) playerCards.push(card);
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
  const pairPlus = Number(readU64BE(view, 8));

  const stage =
    stageByte === 1 ? 'decision' : stageByte === 2 ? 'awaiting' : stageByte === 3 ? 'complete' : 'betting';

  return {
    playerCards,
    dealerCards,
    stage,
    pairPlusBet: Number.isFinite(pairPlus) ? pairPlus : 0,
  };
}

