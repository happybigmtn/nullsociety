import type { Card } from '../../types';
import { decodeCardId } from '../cards';

export interface BaccaratStateUpdate {
  playerCards: Card[];
  bankerCards: Card[];
  playerTotal: number;
  bankerTotal: number;
}

const cardValue = (card: Card): number => {
  if (card.rank === 'A') return 1;
  if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J' || card.rank === '10') return 0;
  return Number(card.rank);
};

const totalValue = (cards: Card[]): number =>
  cards.reduce((sum, card) => sum + cardValue(card), 0) % 10;

export function parseBaccaratState(stateBlob: Uint8Array): BaccaratStateUpdate | null {
  if (stateBlob.length < 1) {
    return null;
  }
  const betCount = stateBlob[0];
  if (betCount === undefined) {
    return null;
  }
  const betsSize = betCount * 9;
  const cardsStart = 1 + betsSize;
  if (stateBlob.length <= cardsStart) {
    return null;
  }
  let offset = cardsStart;
  const playerLen = stateBlob[offset];
  if (playerLen === undefined) {
    return null;
  }
  offset += 1;
  const playerCards: Card[] = [];
  for (let i = 0; i < playerLen && offset < stateBlob.length; i += 1) {
    const cardId = stateBlob[offset];
    if (cardId === undefined) {
      break;
    }
    offset += 1;
    const card = decodeCardId(cardId);
    if (card) {
      playerCards.push(card);
    }
  }
  const bankerLenByte = stateBlob[offset];
  const bankerLen = bankerLenByte ?? 0;
  if (bankerLenByte !== undefined) {
    offset += 1;
  }
  const bankerCards: Card[] = [];
  for (let i = 0; i < bankerLen && offset < stateBlob.length; i += 1) {
    const cardId = stateBlob[offset];
    if (cardId === undefined) {
      break;
    }
    offset += 1;
    const card = decodeCardId(cardId);
    if (card) {
      bankerCards.push(card);
    }
  }

  if (playerCards.length === 0 && bankerCards.length === 0) {
    return null;
  }

  return {
    playerCards,
    bankerCards,
    playerTotal: totalValue(playerCards),
    bankerTotal: totalValue(bankerCards),
  };
}
