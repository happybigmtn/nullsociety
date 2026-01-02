import type { Card } from '../types';

export type BlackjackRules = {
  decks: number;
  hitSoft17: boolean;
  blackjackPays: number; // net win, e.g. 1.5 for 3:2
  doubleAfterSplit: boolean;
  hitSplitAces: boolean;
};

export type BlackjackAnalysis = {
  bestPlay: 'S' | 'H' | 'D' | 'P' | 'R' | 'I';
  values: {
    stand?: number;
    hit?: number;
    double?: number;
    split?: number;
    surrender?: number;
    insurance?: number;
  };
  iterations: number;
  isEstimate: boolean;
  note?: string;
};

const DEFAULT_RULES: BlackjackRules = {
  decks: 8,
  hitSoft17: true,
  blackjackPays: 1.5,
  doubleAfterSplit: true,
  hitSplitAces: true,
};

const RANK_TO_BUCKET: Record<string, number> = {
  '2': 0,
  '3': 1,
  '4': 2,
  '5': 3,
  '6': 4,
  '7': 5,
  '8': 6,
  '9': 7,
  '10': 8,
  J: 8,
  Q: 8,
  K: 8,
  A: 9,
};

const BUCKET_TO_RANK = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1]; // 1 = Ace

const initCounts = (decks: number): number[] => {
  const base = Math.max(1, decks);
  return [
    4 * base,
    4 * base,
    4 * base,
    4 * base,
    4 * base,
    4 * base,
    4 * base,
    4 * base,
    16 * base,
    4 * base,
  ];
};

const rankBucket = (card: Card): number | null => {
  const bucket = RANK_TO_BUCKET[card.rank];
  if (bucket === undefined) return null;
  return bucket;
};

const applyKnownCards = (counts: number[], cards: Card[]): void => {
  for (const card of cards) {
    const bucket = rankBucket(card);
    if (bucket === null) continue;
    if (counts[bucket] > 0) counts[bucket] -= 1;
  }
};

const totalCards = (counts: number[]): number => counts.reduce((sum, n) => sum + n, 0);

const drawRank = (counts: number[]): number => {
  const total = totalCards(counts);
  if (total <= 0) return 10;
  let roll = Math.random() * total;
  for (let i = 0; i < counts.length; i += 1) {
    roll -= counts[i];
    if (roll < 0) {
      counts[i] -= 1;
      return BUCKET_TO_RANK[i] ?? 10;
    }
  }
  counts[counts.length - 1] = Math.max(0, counts[counts.length - 1] - 1);
  return 1;
};

const handValue = (cards: number[]): { total: number; soft: boolean } => {
  let total = 0;
  let aces = 0;
  for (const rank of cards) {
    if (rank === 1) {
      aces += 1;
      total += 11;
    } else {
      total += Math.min(rank, 10);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
};

const isBlackjack = (cards: number[]): boolean => cards.length === 2 && handValue(cards).total === 21;

const dealerPlay = (
  counts: number[],
  upcard: number,
  rules: BlackjackRules
): { total: number; bust: boolean; blackjack: boolean } => {
  const hand = [upcard, drawRank(counts)];
  const blackjack = hand.length === 2 && handValue(hand).total === 21;
  while (true) {
    const { total, soft } = handValue(hand);
    if (total > 21) return { total, bust: true, blackjack };
    if (total > 17) return { total, bust: false, blackjack };
    if (total === 17 && soft && rules.hitSoft17) {
      hand.push(drawRank(counts));
      continue;
    }
    if (total === 17) return { total, bust: false, blackjack };
    hand.push(drawRank(counts));
  }
};

const resolveStand = (
  counts: number[],
  player: number[],
  dealerUp: number,
  rules: BlackjackRules
): number => {
  const playerValue = handValue(player).total;
  if (playerValue > 21) return -1;

  const dealer = dealerPlay(counts, dealerUp, rules);
  const dealerValue = dealer.total;

  const playerBJ = isBlackjack(player);
  const dealerBJ = dealer.blackjack;

  if (playerBJ && !dealerBJ) return rules.blackjackPays;
  if (dealerBJ && !playerBJ) return -1;
  if (dealer.bust) return 1;
  if (playerValue > dealerValue) return 1;
  if (playerValue < dealerValue) return -1;
  return 0;
};

const doubleAllowed = (hand: number[], wasSplit: boolean, rules: BlackjackRules): boolean =>
  hand.length === 2 && (!wasSplit || rules.doubleAfterSplit);

const basicStrategyAction = (
  hand: number[],
  dealerUp: number,
  canSplit: boolean,
  wasSplit: boolean,
  rules: BlackjackRules
): 'H' | 'S' | 'D' | 'P' => {
  if (hand.length === 2 && hand[0] === hand[1] && canSplit) {
    const rank = hand[0] === 1 ? 1 : Math.min(hand[0], 10);
    if (rank === 1) return 'P';
    if (rank === 8) return 'P';
    if ((rank === 2 || rank === 3) && dealerUp >= 2 && dealerUp <= 7) return 'P';
    if (rank === 4 && dealerUp >= 5 && dealerUp <= 6) return 'P';
    if (rank === 6 && dealerUp >= 2 && dealerUp <= 6) return 'P';
    if (rank === 7 && dealerUp >= 2 && dealerUp <= 7) return 'P';
    if (rank === 9 && ((dealerUp >= 2 && dealerUp <= 6) || dealerUp === 8 || dealerUp === 9)) return 'P';
  }

  const { total, soft } = handValue(hand);
  if (soft) {
    if (total <= 14) return doubleAllowed(hand, wasSplit, rules) && dealerUp >= 5 && dealerUp <= 6 ? 'D' : 'H';
    if (total === 15 || total === 16) return doubleAllowed(hand, wasSplit, rules) && dealerUp >= 4 && dealerUp <= 6 ? 'D' : 'H';
    if (total === 17) return doubleAllowed(hand, wasSplit, rules) && dealerUp >= 3 && dealerUp <= 6 ? 'D' : 'H';
    if (total === 18) {
      if (doubleAllowed(hand, wasSplit, rules) && dealerUp >= 3 && dealerUp <= 6) return 'D';
      if (dealerUp === 2 || dealerUp === 7 || dealerUp === 8) return 'S';
      return 'H';
    }
    return 'S';
  }

  if (total >= 17) return 'S';
  if (total >= 13 && total <= 16) return dealerUp >= 2 && dealerUp <= 6 ? 'S' : 'H';
  if (total === 12) return dealerUp >= 4 && dealerUp <= 6 ? 'S' : 'H';
  if (total === 11) return doubleAllowed(hand, wasSplit, rules) && dealerUp >= 2 && dealerUp <= 10 ? 'D' : 'H';
  if (total === 10) return doubleAllowed(hand, wasSplit, rules) && dealerUp >= 2 && dealerUp <= 9 ? 'D' : 'H';
  if (total === 9) return doubleAllowed(hand, wasSplit, rules) && dealerUp >= 3 && dealerUp <= 6 ? 'D' : 'H';
  return 'H';
};

const simulateHand = (
  counts: number[],
  player: number[],
  dealerUp: number,
  rules: BlackjackRules,
  wasSplit: boolean,
  canSplit: boolean
): number => {
  while (true) {
    const { total } = handValue(player);
    if (total > 21) return -1;
    const action = basicStrategyAction(player, dealerUp, canSplit, wasSplit, rules);
    if (action === 'S') return resolveStand(counts, player, dealerUp, rules);
    if (action === 'D') {
      player.push(drawRank(counts));
      if (handValue(player).total > 21) return -2;
      return 2 * resolveStand(counts, player, dealerUp, rules);
    }
    if (action === 'P' && canSplit && player.length === 2 && player[0] === player[1]) {
      return simulateSplit(counts, player, dealerUp, rules);
    }
    player.push(drawRank(counts));
    canSplit = false;
  }
};

const simulateSplit = (
  counts: number[],
  player: number[],
  dealerUp: number,
  rules: BlackjackRules
): number => {
  const rank = player[0];
  const handA = [rank, drawRank(counts)];
  const handB = [rank, drawRank(counts)];
  if (rank === 1 && !rules.hitSplitAces) {
    return (
      resolveStand(counts, handA, dealerUp, rules) +
      resolveStand(counts, handB, dealerUp, rules)
    );
  }
  const resA = simulateHand(counts, handA, dealerUp, rules, true, false);
  const resB = simulateHand(counts, handB, dealerUp, rules, true, false);
  return resA + resB;
};

const simulateAction = (
  action: 'stand' | 'hit' | 'double' | 'split' | 'surrender',
  counts: number[],
  player: number[],
  dealerUp: number,
  rules: BlackjackRules,
  allowSplit: boolean
): number => {
  if (action === 'surrender') return -0.5;
  if (action === 'stand') return resolveStand(counts, player, dealerUp, rules);
  if (action === 'double') {
    const next = drawRank(counts);
    const hand = [...player, next];
    if (handValue(hand).total > 21) return -2;
    return 2 * resolveStand(counts, hand, dealerUp, rules);
  }
  if (action === 'split') {
    if (!allowSplit || player.length !== 2 || player[0] !== player[1]) return NaN;
    return simulateSplit(counts, player, dealerUp, rules);
  }
  // hit
  const hand = [...player, drawRank(counts)];
  if (handValue(hand).total > 21) return -1;
  return simulateHand(counts, hand, dealerUp, rules, false, false);
};

const estimateEV = (
  action: 'stand' | 'hit' | 'double' | 'split' | 'surrender',
  counts: number[],
  player: number[],
  dealerUp: number,
  rules: BlackjackRules,
  allowSplit: boolean,
  iterations: number
): number => {
  let total = 0;
  for (let i = 0; i < iterations; i += 1) {
    const localCounts = counts.slice();
    total += simulateAction(action, localCounts, [...player], dealerUp, rules, allowSplit);
  }
  return total / iterations;
};

const insuranceEV = (counts: number[]): number => {
  const total = totalCards(counts);
  if (total <= 0) return -0.5;
  const tens = counts[8] ?? 0;
  const p = tens / total;
  return 1.5 * p - 0.5;
};

const rankValue = (card: Card): number => {
  if (card.rank === 'A') return 1;
  if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J' || card.rank === '10') return 10;
  const asNumber = Number(card.rank);
  return Number.isFinite(asNumber) ? asNumber : 10;
};

export const analyzeBlackjackHand = (params: {
  playerCards: Card[];
  dealerCard: Card | null;
  knownCards: Card[];
  canSplit: boolean;
  canDouble: boolean;
  canSurrender: boolean;
  canHit: boolean;
  canStand: boolean;
  rules?: Partial<BlackjackRules>;
  iterations?: number;
}): BlackjackAnalysis | null => {
  const {
    playerCards,
    dealerCard,
    knownCards,
    canSplit,
    canDouble,
    canSurrender,
    canHit,
    canStand,
  } = params;

  if (!dealerCard || playerCards.length === 0) return null;

  const rules = { ...DEFAULT_RULES, ...(params.rules || {}) };
  const counts = initCounts(rules.decks);
  applyKnownCards(counts, knownCards);

  const dealerUp = rankValue(dealerCard);
  const playerRanks = playerCards.map(rankValue);
  const iterations = params.iterations ?? 4000;
  const values: BlackjackAnalysis['values'] = {};

  if (canStand) values.stand = estimateEV('stand', counts, playerRanks, dealerUp, rules, canSplit, iterations);
  if (canHit) values.hit = estimateEV('hit', counts, playerRanks, dealerUp, rules, canSplit, iterations);
  if (canDouble) values.double = estimateEV('double', counts, playerRanks, dealerUp, rules, canSplit, iterations);
  if (canSplit) values.split = estimateEV('split', counts, playerRanks, dealerUp, rules, canSplit, iterations);
  if (canSurrender) values.surrender = -0.5;
  if (dealerCard.rank === 'A') values.insurance = insuranceEV(counts);

  let bestPlay: BlackjackAnalysis['bestPlay'] = 'S';
  let bestValue = -Infinity;
  const pick = (play: BlackjackAnalysis['bestPlay'], value?: number) => {
    if (value === undefined || Number.isNaN(value)) return;
    if (value > bestValue) {
      bestValue = value;
      bestPlay = play;
    }
  };
  pick('S', values.stand);
  pick('H', values.hit);
  pick('D', values.double);
  pick('P', values.split);
  pick('R', values.surrender);
  pick('I', values.insurance);

  return {
    bestPlay,
    values,
    iterations,
    isEstimate: true,
    note: 'Estimates use Monte Carlo with basic strategy after the first action and model a single split only.',
  };
};
