import type { Card } from '../../types';

const SUITS: readonly Card['suit'][] = ['♠', '♥', '♦', '♣'];
const RANKS: readonly Card['rank'][] = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
];

export const decodeCard = (value: number): Card => {
  if (value === 0xff) {
    return { rank: 'A', suit: '♠', value: 0, isHidden: true };
  }
  if (value === undefined || value === null || Number.isNaN(value) || value < 0 || value > 51) {
    return { rank: '2', suit: '♠', value: 2, isHidden: false };
  }
  const suit = SUITS[Math.floor(value / 13)];
  const rankIdx = value % 13;
  const rank = RANKS[rankIdx];
  let cardValue: number;
  if (rankIdx === 0) {
    cardValue = 11;
  } else if (rankIdx <= 8) {
    cardValue = rankIdx + 1;
  } else {
    cardValue = 10;
  }

  return {
    suit,
    rank,
    value: cardValue,
    isHidden: false,
  };
};

export const cardIdToString = (cardId: number): string => {
  if (cardId < 0 || cardId >= 52) {
    return '?';
  }
  const suitIndex = Math.floor(cardId / 13);
  const rankIndex = cardId % 13;
  const suit = SUITS[suitIndex];
  const rank = RANKS[rankIndex];
  return `${rank}${suit}`;
};
