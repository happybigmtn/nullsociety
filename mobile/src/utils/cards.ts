import type { Card, Suit, Rank } from '../types';

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function decodeCardId(cardId: number): Card | null {
  if (!Number.isInteger(cardId) || cardId < 0 || cardId >= 52) {
    return null;
  }

  const suitIndex = Math.floor(cardId / 13);
  const rankIndex = cardId % 13;
  const suit = SUITS[suitIndex];
  const rank = RANKS[rankIndex];

  if (!suit || !rank) {
    return null;
  }

  return { suit, rank };
}

export function decodeCardList(cards: ArrayLike<number>): Card[] {
  const decoded: Card[] = [];
  for (let i = 0; i < cards.length; i += 1) {
    const card = decodeCardId(Number(cards[i]));
    if (card) {
      decoded.push(card);
    }
  }
  return decoded;
}

export function isHiddenCard(cardId: number): boolean {
  return cardId === 0xff;
}

