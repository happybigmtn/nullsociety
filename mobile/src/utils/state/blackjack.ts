import type { Card } from '../../types';
import { decodeCardList } from '../cards';
import { safeSlice } from './shared';

export type BlackjackPhase = 'betting' | 'player_turn' | 'dealer_turn' | 'result';

export interface BlackjackStateUpdate {
  playerCards: Card[];
  dealerCards: Card[];
  playerTotal: number;
  dealerTotal: number;
  phase: BlackjackPhase;
  canDouble: boolean;
  canSplit: boolean;
  dealerHidden: boolean;
}

function calculateBlackjackTotal(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.rank === 'A') {
      total += 11;
      aces += 1;
    } else if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J') {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

export function parseBlackjackState(stateBlob: Uint8Array): BlackjackStateUpdate | null {
  if (stateBlob.length < 14 || stateBlob[0] !== 2) {
    return null;
  }

  let offset = 0;
  offset += 1; // version
  const stage = stateBlob[offset];
  if (stage === undefined) {
    return null;
  }
  offset += 1;
  offset += 8; // side_bet_21plus3
  offset += 2; // initial player cards
  const activeHandIdx = stateBlob[offset];
  if (activeHandIdx === undefined) {
    return null;
  }
  offset += 1;
  const handCount = stateBlob[offset];
  if (handCount === undefined) {
    return null;
  }
  offset += 1;

  const hands: Card[][] = [];
  for (let h = 0; h < handCount; h += 1) {
    if (offset + 4 > stateBlob.length) {
      return null;
    }
    const betMult = stateBlob[offset];
    if (betMult === undefined) {
      return null;
    }
    offset += 1;
    offset += 2; // status + was_split
    const cardCount = stateBlob[offset];
    if (cardCount === undefined) {
      return null;
    }
    offset += 1;
    const handBytes = safeSlice(stateBlob, offset, cardCount);
    if (!handBytes) {
      return null;
    }
    const cards = decodeCardList(handBytes);
    offset += cardCount;
    if (betMult > 0 || cards.length > 0) {
      hands.push(cards);
    }
  }

  if (offset >= stateBlob.length) {
    return null;
  }
  const dealerCount = stateBlob[offset];
  if (dealerCount === undefined) {
    return null;
  }
  offset += 1;
  const dealerBytes = safeSlice(stateBlob, offset, dealerCount);
  if (!dealerBytes) {
    return null;
  }
  const dealerCards = decodeCardList(dealerBytes);
  offset += dealerCount;

  // Skip rules bytes if present.
  if (offset + 2 <= stateBlob.length) {
    offset += 2;
  }

  const playerValue = offset < stateBlob.length ? stateBlob[offset] : null;
  const dealerValue = offset + 1 < stateBlob.length ? stateBlob[offset + 1] : null;
  const actionMask = offset + 2 < stateBlob.length ? stateBlob[offset + 2] ?? 0 : 0;

  const activeIndex = activeHandIdx < hands.length ? activeHandIdx : Math.max(hands.length - 1, 0);
  const playerCards = hands[activeIndex] ?? [];

  const derivedPlayerTotal = playerCards.length > 0 ? calculateBlackjackTotal(playerCards) : 0;
  const derivedDealerTotal = dealerCards.length > 0 ? calculateBlackjackTotal(dealerCards) : 0;

  const phase: BlackjackPhase =
    stage === 0 ? 'betting' : stage === 1 ? 'player_turn' : stage === 2 ? 'dealer_turn' : 'result';

  return {
    playerCards,
    dealerCards,
    playerTotal: playerValue ?? derivedPlayerTotal,
    dealerTotal: dealerValue ?? derivedDealerTotal,
    phase,
    canDouble: (actionMask & 0x04) !== 0,
    canSplit: (actionMask & 0x08) !== 0,
    dealerHidden: phase !== 'result',
  };
}
