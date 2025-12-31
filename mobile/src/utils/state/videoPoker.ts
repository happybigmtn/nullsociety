import type { Card } from '../../types';
import { decodeCardId } from '../cards';

export interface VideoPokerStateUpdate {
  cards: Card[];
  stage: 'deal' | 'draw';
}

export function parseVideoPokerState(stateBlob: Uint8Array): VideoPokerStateUpdate | null {
  if (stateBlob.length < 6) {
    return null;
  }
  const stageByte = stateBlob[0];
  if (stageByte === undefined) {
    return null;
  }
  const stage = stageByte === 1 ? 'draw' : 'deal';
  const cards: Card[] = [];
  for (let i = 1; i <= 5 && i < stateBlob.length; i += 1) {
    const cardId = stateBlob[i];
    if (cardId === undefined) {
      break;
    }
    const card = decodeCardId(cardId);
    if (card) {
      cards.push(card);
    }
  }
  return { cards, stage };
}
