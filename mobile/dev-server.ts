/**
 * Development Game Server for Mobile App Testing
 *
 * A simple WebSocket server that handles casino game messages
 * and returns appropriate responses for testing the mobile app.
 *
 * Run: npx tsx dev-server.ts
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

const PORT = 8080;

// Card utilities
type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

interface Card {
  suit: Suit;
  rank: Rank;
}

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function cardValue(card: Card): number {
  if (card.rank === 'A') return 11;
  if (['K', 'Q', 'J'].includes(card.rank)) return 10;
  return parseInt(card.rank);
}

function handTotal(cards: Card[]): number {
  let total = cards.reduce((sum, card) => sum + cardValue(card), 0);
  let aces = cards.filter(c => c.rank === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

// Session state per connection
interface GameSession {
  balance: number;
  deck: Card[];
  // Blackjack state
  playerCards: Card[];
  dealerCards: Card[];
  bet: number;
  // Hi-Lo state
  currentCard: Card | null;
  // Video Poker state
  pokerCards: Card[];
  pokerBet: number;
}

function createSession(): GameSession {
  return {
    balance: 10000, // Start with $10,000
    deck: shuffleDeck(createDeck()),
    playerCards: [],
    dealerCards: [],
    bet: 0,
    currentCard: null,
    pokerCards: [],
    pokerBet: 0,
  };
}

function drawCard(session: GameSession): Card {
  if (session.deck.length === 0) {
    session.deck = shuffleDeck(createDeck());
  }
  return session.deck.pop()!;
}

// Message handlers
function handleBlackjackDeal(session: GameSession, amount: number): object {
  if (amount > session.balance) {
    return { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough balance' };
  }

  session.bet = amount;
  session.balance -= amount;
  session.deck = shuffleDeck(createDeck());
  session.playerCards = [drawCard(session), drawCard(session)];
  session.dealerCards = [drawCard(session), drawCard(session)];

  const playerTotal = handTotal(session.playerCards);
  const dealerTotal = handTotal([session.dealerCards[0]]);

  // Check for blackjack
  if (playerTotal === 21) {
    const payout = Math.floor(amount * 2.5);
    session.balance += payout;
    return {
      type: 'game_result',
      playerCards: session.playerCards,
      dealerCards: session.dealerCards,
      playerTotal: 21,
      dealerTotal: handTotal(session.dealerCards),
      blackjack: true,
      won: true,
      payout,
      balance: session.balance,
      message: 'Blackjack!',
    };
  }

  return {
    type: 'card_dealt',
    playerCards: session.playerCards,
    dealerCards: [session.dealerCards[0], { suit: 'spades', rank: 'A', hidden: true }],
    playerTotal,
    dealerTotal,
    canDouble: session.balance >= amount,
    canSplit: session.playerCards[0].rank === session.playerCards[1].rank && session.balance >= amount,
    balance: session.balance,
  };
}

function handleBlackjackHit(session: GameSession): object {
  session.playerCards.push(drawCard(session));
  const playerTotal = handTotal(session.playerCards);

  if (playerTotal > 21) {
    return {
      type: 'game_result',
      playerCards: session.playerCards,
      dealerCards: session.dealerCards,
      playerTotal,
      dealerTotal: handTotal(session.dealerCards),
      won: false,
      payout: 0,
      balance: session.balance,
      message: 'Bust!',
    };
  }

  return {
    type: 'card_dealt',
    playerCards: session.playerCards,
    dealerCards: [session.dealerCards[0], { suit: 'spades', rank: 'A', hidden: true }],
    playerTotal,
    dealerTotal: cardValue(session.dealerCards[0]),
    canDouble: false,
    canSplit: false,
    balance: session.balance,
  };
}

function handleBlackjackStand(session: GameSession): object {
  // Dealer draws to 17
  while (handTotal(session.dealerCards) < 17) {
    session.dealerCards.push(drawCard(session));
  }

  const playerTotal = handTotal(session.playerCards);
  const dealerTotal = handTotal(session.dealerCards);

  let won = false;
  let push = false;
  let payout = 0;
  let message = '';

  if (dealerTotal > 21) {
    won = true;
    payout = session.bet * 2;
    message = 'Dealer busts!';
  } else if (playerTotal > dealerTotal) {
    won = true;
    payout = session.bet * 2;
    message = 'You win!';
  } else if (playerTotal < dealerTotal) {
    message = 'Dealer wins';
  } else {
    push = true;
    payout = session.bet;
    message = 'Push';
  }

  session.balance += payout;

  return {
    type: 'game_result',
    playerCards: session.playerCards,
    dealerCards: session.dealerCards,
    playerTotal,
    dealerTotal,
    won,
    push,
    payout,
    balance: session.balance,
    message,
  };
}

function handleHiLoDeal(session: GameSession): object {
  session.currentCard = drawCard(session);
  return {
    type: 'state_update',
    card: session.currentCard,
    balance: session.balance,
  };
}

function handleHiLoBet(session: GameSession, amount: number, choice: 'higher' | 'lower'): object {
  if (amount > session.balance) {
    return { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough balance' };
  }

  session.balance -= amount;
  const nextCard = drawCard(session);
  const currentValue = cardValue(session.currentCard!);
  const nextValue = cardValue(nextCard);

  const isHigher = nextValue > currentValue;
  const isLower = nextValue < currentValue;
  const won = (choice === 'higher' && isHigher) || (choice === 'lower' && isLower);

  let payout = 0;
  if (won) {
    payout = amount * 2;
    session.balance += payout;
  }

  session.currentCard = nextCard;

  return {
    type: 'game_result',
    card: session.currentCard,
    nextCard,
    won,
    payout,
    balance: session.balance,
    message: won ? 'Correct!' : 'Wrong!',
  };
}

function handleVideoPokerDeal(session: GameSession, amount: number): object {
  if (amount > session.balance) {
    return { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough balance' };
  }

  session.pokerBet = amount;
  session.balance -= amount;
  session.deck = shuffleDeck(createDeck());
  session.pokerCards = [drawCard(session), drawCard(session), drawCard(session), drawCard(session), drawCard(session)];

  return {
    type: 'cards_dealt',
    cards: session.pokerCards,
    balance: session.balance,
  };
}

function evaluatePokerHand(cards: Card[]): { hand: string; payout: number } {
  // Simplified poker hand evaluation
  const ranks = cards.map(c => c.rank);
  const suits = cards.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);
  const rankCounts = new Map<Rank, number>();
  for (const r of ranks) {
    rankCounts.set(r, (rankCounts.get(r) || 0) + 1);
  }
  const counts = [...rankCounts.values()].sort((a, b) => b - a);

  // Check for pairs, three of a kind, etc.
  if (counts[0] === 4) return { hand: 'FOUR_OF_A_KIND', payout: 25 };
  if (counts[0] === 3 && counts[1] === 2) return { hand: 'FULL_HOUSE', payout: 9 };
  if (isFlush) return { hand: 'FLUSH', payout: 6 };
  if (counts[0] === 3) return { hand: 'THREE_OF_A_KIND', payout: 3 };
  if (counts[0] === 2 && counts[1] === 2) return { hand: 'TWO_PAIR', payout: 2 };
  if (counts[0] === 2) {
    const pairRank = [...rankCounts.entries()].find(([_, v]) => v === 2)?.[0];
    if (pairRank && ['J', 'Q', 'K', 'A'].includes(pairRank)) {
      return { hand: 'JACKS_OR_BETTER', payout: 1 };
    }
  }
  return { hand: 'NOTHING', payout: 0 };
}

function handleVideoPokerDraw(session: GameSession, held: boolean[]): object {
  // Replace non-held cards
  for (let i = 0; i < 5; i++) {
    if (!held[i]) {
      session.pokerCards[i] = drawCard(session);
    }
  }

  const { hand, payout: multiplier } = evaluatePokerHand(session.pokerCards);
  const payout = session.pokerBet * multiplier;
  session.balance += payout;

  return {
    type: 'game_result',
    cards: session.pokerCards,
    hand,
    payout,
    balance: session.balance,
    message: payout > 0 ? `${hand.replace(/_/g, ' ')}!` : 'No win',
  };
}

function handleRouletteSpn(
  session: GameSession,
  bets: Array<{ type: string; amount: number; target?: number; number?: number; value?: number }>
): object {
  const totalBet = bets.reduce((sum, b) => sum + b.amount, 0);
  if (totalBet > session.balance) {
    return { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough balance' };
  }

  session.balance -= totalBet;
  const result = Math.floor(Math.random() * 37); // 0-36
  const reds = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  const blacks = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

  let winAmount = 0;
  for (const bet of bets) {
    const type = bet.type.toUpperCase();
    const target = bet.target ?? bet.number ?? bet.value ?? 0;

    if ((type === 'STRAIGHT' || type === 'ZERO') && target === result) {
      winAmount += bet.amount * 36;
    } else if (type === 'RED' && reds.includes(result)) {
      winAmount += bet.amount * 2;
    } else if (type === 'BLACK' && blacks.includes(result)) {
      winAmount += bet.amount * 2;
    } else if (type === 'ODD' && result > 0 && result % 2 === 1) {
      winAmount += bet.amount * 2;
    } else if (type === 'EVEN' && result > 0 && result % 2 === 0) {
      winAmount += bet.amount * 2;
    } else if (type === 'LOW' && result >= 1 && result <= 18) {
      winAmount += bet.amount * 2;
    } else if (type === 'HIGH' && result >= 19 && result <= 36) {
      winAmount += bet.amount * 2;
    } else if (type === 'DOZEN_1' && result >= 1 && result <= 12) {
      winAmount += bet.amount * 3;
    } else if (type === 'DOZEN_2' && result >= 13 && result <= 24) {
      winAmount += bet.amount * 3;
    } else if (type === 'DOZEN_3' && result >= 25 && result <= 36) {
      winAmount += bet.amount * 3;
    } else if (type === 'COL_1' && result >= 1 && result <= 34 && (result - 1) % 3 === 0) {
      winAmount += bet.amount * 3;
    } else if (type === 'COL_2' && result >= 2 && result <= 35 && (result - 2) % 3 === 0) {
      winAmount += bet.amount * 3;
    } else if (type === 'COL_3' && result >= 3 && result <= 36 && result % 3 === 0) {
      winAmount += bet.amount * 3;
    } else if (type === 'SPLIT_H' && result === target) {
      winAmount += bet.amount * 18;
    } else if (type === 'SPLIT_H' && result === target + 1) {
      winAmount += bet.amount * 18;
    } else if (type === 'SPLIT_V' && result === target) {
      winAmount += bet.amount * 18;
    } else if (type === 'SPLIT_V' && result === target + 3) {
      winAmount += bet.amount * 18;
    } else if (type === 'STREET' && result >= target && result <= target + 2) {
      winAmount += bet.amount * 12;
    } else if (type === 'CORNER' && [target, target + 1, target + 3, target + 4].includes(result)) {
      winAmount += bet.amount * 9;
    } else if (type === 'SIX_LINE' && result >= target && result <= target + 5) {
      winAmount += bet.amount * 6;
    }
  }

  session.balance += winAmount;

  return {
    type: 'game_result',
    result,
    won: winAmount > 0,
    winAmount,
    balance: session.balance,
    message: winAmount > 0 ? `${result} - You win $${winAmount}!` : `${result} - No win`,
  };
}

function handleCrapsRoll(session: GameSession, bets: Array<{ type: string; amount: number; target?: number }>): object {
  const totalBet = bets.reduce((sum, b) => sum + b.amount, 0);
  if (totalBet > session.balance) {
    return { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough balance' };
  }

  session.balance -= totalBet;
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const total = die1 + die2;

  let winAmount = 0;
  for (const bet of bets) {
    const type = bet.type.toUpperCase();
    const target = bet.target ?? 0;

    if ((type === 'PASS' || type === 'PASS_LINE') && (total === 7 || total === 11)) {
      winAmount += bet.amount * 2;
    } else if ((type === 'DONT_PASS' || type === 'DONT') && (total === 2 || total === 3)) {
      winAmount += bet.amount * 2;
    } else if (type === 'FIELD' && [2, 3, 4, 9, 10, 11, 12].includes(total)) {
      winAmount += bet.amount * 2;
    } else if (type === 'YES' && total === target) {
      winAmount += bet.amount * 2;
    } else if (type === 'NO' && total === target) {
      winAmount += bet.amount * 2;
    } else if (type === 'NEXT' && total === target) {
      winAmount += bet.amount * 2;
    } else if (type === 'HARDWAY' && total === target && die1 === die2) {
      winAmount += bet.amount * 2;
    }
  }

  session.balance += winAmount;

  return {
    type: 'game_result',
    dice: [die1, die2] as [number, number],
    point: null,
    won: winAmount > 0,
    winAmount,
    balance: session.balance,
    message: winAmount > 0 ? `${total} - You win!` : `${total} - No win`,
  };
}

function handleSicBoRoll(session: GameSession, bets: Array<{ type: string; amount: number; target?: number }>): object {
  const totalBet = bets.reduce((sum, b) => sum + b.amount, 0);
  if (totalBet > session.balance) {
    return { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough balance' };
  }

  session.balance -= totalBet;
  const dice: [number, number, number] = [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ];
  const total = dice[0] + dice[1] + dice[2];

  let winAmount = 0;
  for (const bet of bets) {
    const type = bet.type.toUpperCase();
    const isTriple = dice[0] === dice[1] && dice[1] === dice[2];
    const tripleValue = isTriple ? dice[0] : null;

    if (type === 'SMALL' && total >= 4 && total <= 10 && !isTriple) {
      winAmount += bet.amount * 2;
    } else if (type === 'BIG' && total >= 11 && total <= 17 && !isTriple) {
      winAmount += bet.amount * 2;
    } else if ((type === 'TRIPLE_ANY' || type === 'ANY_TRIPLE') && isTriple) {
      winAmount += bet.amount * 31;
    } else if (type === 'TRIPLE_SPECIFIC' && isTriple && bet.target === tripleValue) {
      winAmount += bet.amount * 31;
    }
  }

  session.balance += winAmount;

  return {
    type: 'game_result',
    dice,
    won: winAmount > 0,
    winAmount,
    balance: session.balance,
    message: winAmount > 0 ? `Total ${total} - You win!` : `Total ${total} - No win`,
  };
}

function handleBaccaratDeal(session: GameSession, bets: Array<{ type: string; amount: number }>): object {
  const totalBet = bets.reduce((sum, b) => sum + b.amount, 0);
  if (totalBet > session.balance) {
    return { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough balance' };
  }

  session.balance -= totalBet;
  session.deck = shuffleDeck(createDeck());

  const playerCards = [drawCard(session), drawCard(session)];
  const bankerCards = [drawCard(session), drawCard(session)];

  const baccaratValue = (cards: Card[]): number => {
    return cards.reduce((sum, card) => {
      const val = cardValue(card);
      return (sum + (val >= 10 ? 0 : val)) % 10;
    }, 0);
  };

  const playerTotal = baccaratValue(playerCards);
  const bankerTotal = baccaratValue(bankerCards);

  let winner: 'PLAYER' | 'BANKER' | 'TIE';
  if (playerTotal > bankerTotal) winner = 'PLAYER';
  else if (bankerTotal > playerTotal) winner = 'BANKER';
  else winner = 'TIE';

  let winAmount = 0;
  for (const bet of bets) {
    if (bet.type === winner) {
      if (winner === 'TIE') winAmount += bet.amount * 9;
      else if (winner === 'BANKER') winAmount += Math.floor(bet.amount * 1.95);
      else winAmount += bet.amount * 2;
    }
  }

  session.balance += winAmount;

  return {
    type: 'game_result',
    playerCards,
    bankerCards,
    playerTotal,
    bankerTotal,
    winner,
    payout: winAmount,
    balance: session.balance,
    message: `${winner} wins!`,
  };
}

function handleCasinoWarDeal(session: GameSession, amount: number): object {
  if (amount > session.balance) {
    return { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough balance' };
  }

  session.bet = amount;
  session.balance -= amount;
  session.deck = shuffleDeck(createDeck());

  const playerCard = drawCard(session);
  const dealerCard = drawCard(session);

  const playerValue = RANKS.indexOf(playerCard.rank);
  const dealerValue = RANKS.indexOf(dealerCard.rank);

  if (playerValue === dealerValue) {
    return {
      type: 'tie',
      playerCard,
      dealerCard,
      balance: session.balance,
      message: 'Tie! Go to war or Surrender?',
    };
  }

  const won = playerValue > dealerValue;
  const payout = won ? amount * 2 : 0;
  session.balance += payout;

  return {
    type: 'game_result',
    playerCard,
    dealerCard,
    won,
    payout,
    balance: session.balance,
    message: won ? 'You win!' : 'Dealer wins',
  };
}

function handleThreeCardPokerDeal(session: GameSession, anteBet: number, pairPlusBet: number): object {
  const totalBet = anteBet + pairPlusBet;
  if (totalBet > session.balance) {
    return { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough balance' };
  }

  session.bet = anteBet;
  session.balance -= totalBet;
  session.deck = shuffleDeck(createDeck());

  const playerCards = [drawCard(session), drawCard(session), drawCard(session)];
  const dealerCards = [drawCard(session), drawCard(session), drawCard(session)];

  // Store for play decision
  session.playerCards = playerCards;
  session.dealerCards = dealerCards;

  // Evaluate player hand for display
  const evaluateHand = (cards: Card[]): string => {
    const ranks = cards.map(c => RANKS.indexOf(c.rank)).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);
    const isFlush = suits.every(s => s === suits[0]);
    const isStraight = ranks[0] - ranks[1] === 1 && ranks[1] - ranks[2] === 1;

    if (isFlush && isStraight) return 'STRAIGHT_FLUSH';
    if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) return 'THREE_OF_A_KIND';
    if (isStraight) return 'STRAIGHT';
    if (isFlush) return 'FLUSH';
    if (ranks[0] === ranks[1] || ranks[1] === ranks[2]) return 'PAIR';
    return 'HIGH_CARD';
  };

  return {
    type: 'cards_dealt',
    playerCards,
    dealerCards: dealerCards.map(() => ({ suit: 'spades', rank: 'A', hidden: true })),
    playerHand: evaluateHand(playerCards),
    balance: session.balance,
  };
}

function handleThreeCardPokerPlay(session: GameSession): object {
  // Deduct play bet (equal to ante)
  session.balance -= session.bet;

  const evaluateHand = (cards: Card[]): { name: string; value: number } => {
    const ranks = cards.map(c => RANKS.indexOf(c.rank)).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);
    const isFlush = suits.every(s => s === suits[0]);
    const isStraight = ranks[0] - ranks[1] === 1 && ranks[1] - ranks[2] === 1;

    const baseValue = ranks[0] * 1000 + ranks[1] * 100 + ranks[2];
    if (isFlush && isStraight) return { name: 'STRAIGHT_FLUSH', value: 6000000 + baseValue };
    if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) return { name: 'THREE_OF_A_KIND', value: 5000000 + baseValue };
    if (isStraight) return { name: 'STRAIGHT', value: 4000000 + baseValue };
    if (isFlush) return { name: 'FLUSH', value: 3000000 + baseValue };
    if (ranks[0] === ranks[1] || ranks[1] === ranks[2]) return { name: 'PAIR', value: 2000000 + baseValue };
    return { name: 'HIGH_CARD', value: baseValue };
  };

  const playerHand = evaluateHand(session.playerCards);
  const dealerHand = evaluateHand(session.dealerCards);
  const dealerQualifies = dealerHand.value >= 2000000 + 10 * 1000; // Queen high or better

  let payout = 0;
  let anteResult: 'win' | 'loss' | 'push';

  if (!dealerQualifies) {
    payout += session.bet; // Ante pays 1:1
    payout += session.bet; // Play pushes (returned)
    anteResult = 'win';
  } else if (playerHand.value > dealerHand.value) {
    payout += session.bet * 2; // Ante pays 1:1
    payout += session.bet * 2; // Play pays 1:1
    anteResult = 'win';
  } else if (playerHand.value < dealerHand.value) {
    anteResult = 'loss';
  } else {
    payout += session.bet * 2; // Both push
    anteResult = 'push';
  }

  session.balance += payout;

  return {
    type: 'game_result',
    playerCards: session.playerCards,
    dealerCards: session.dealerCards,
    playerHand: playerHand.name,
    dealerHand: dealerHand.name,
    dealerQualifies,
    anteResult,
    pairPlusResult: null,
    payout,
    balance: session.balance,
    message: anteResult === 'win' ? 'You win!' : anteResult === 'push' ? 'Push' : 'Dealer wins',
  };
}

function handleThreeCardPokerFold(session: GameSession): object {
  return {
    type: 'game_result',
    playerCards: session.playerCards,
    dealerCards: session.dealerCards,
    anteResult: 'loss',
    pairPlusResult: null,
    payout: 0,
    balance: session.balance,
    message: 'Folded',
  };
}

// WebSocket server
const server = createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected');
  const session = createSession();

  // Send initial balance
  ws.send(JSON.stringify({
    type: 'state_update',
    balance: session.balance,
  }));

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received:', message.type);

      let response: object;

      switch (message.type) {
        // Blackjack
        case 'blackjack_deal':
          response = handleBlackjackDeal(session, message.amount);
          break;
        case 'blackjack_hit':
          response = handleBlackjackHit(session);
          break;
        case 'blackjack_stand':
          response = handleBlackjackStand(session);
          break;
        case 'blackjack_double':
          session.balance -= session.bet;
          session.bet *= 2;
          session.playerCards.push(drawCard(session));
          response = handleBlackjackStand(session);
          break;

        // Hi-Lo
        case 'hilo_deal':
          response = handleHiLoDeal(session);
          break;
        case 'hilo_bet':
          response = handleHiLoBet(session, message.amount, message.choice);
          break;

        // Video Poker
        case 'video_poker_deal':
          response = handleVideoPokerDeal(session, message.amount);
          break;
        case 'video_poker_draw':
          response = handleVideoPokerDraw(session, message.held);
          break;

        // Roulette
        case 'roulette_spin':
          response = handleRouletteSpn(session, message.bets);
          break;

        // Craps
        case 'craps_roll':
          response = handleCrapsRoll(session, message.bets);
          break;

        // Sic Bo
        case 'sic_bo_roll':
          response = handleSicBoRoll(session, message.bets);
          break;

        // Baccarat
        case 'baccarat_deal':
          response = handleBaccaratDeal(session, message.bets);
          break;

        // Casino War
        case 'casino_war_deal':
          response = handleCasinoWarDeal(session, message.amount);
          break;
        case 'casino_war_war':
          // Go to war - simplified
          session.balance -= session.bet;
          const warPlayerCard = drawCard(session);
          const warDealerCard = drawCard(session);
          const warWon = RANKS.indexOf(warPlayerCard.rank) >= RANKS.indexOf(warDealerCard.rank);
          const warPayout = warWon ? session.bet * 3 : 0;
          session.balance += warPayout;
          response = {
            type: 'game_result',
            playerCard: warPlayerCard,
            dealerCard: warDealerCard,
            won: warWon,
            payout: warPayout,
            balance: session.balance,
            message: warWon ? 'You win the war!' : 'Dealer wins the war',
          };
          break;
        case 'casino_war_surrender':
          session.balance += Math.floor(session.bet / 2);
          response = {
            type: 'game_result',
            won: false,
            payout: 0,
            balance: session.balance,
            message: 'Surrendered - half bet returned',
          };
          break;

        // Three Card Poker
        case 'three_card_poker_deal':
          response = handleThreeCardPokerDeal(
            session,
            message.ante ?? message.anteBet ?? 0,
            message.pairPlus ?? message.pairPlusBet ?? 0
          );
          break;
        case 'three_card_poker_play':
          response = handleThreeCardPokerPlay(session);
          break;
        case 'three_card_poker_fold':
          response = handleThreeCardPokerFold(session);
          break;

        // Ultimate TX Hold'em (simplified)
        case 'ultimate_tx_deal':
          session.bet = message.ante ?? message.anteBet ?? 0;
          session.balance -= (message.ante ?? message.anteBet ?? 0)
            + (message.blind ?? message.blindBet ?? 0)
            + (message.trips ?? message.tripsBet ?? 0);
          session.deck = shuffleDeck(createDeck());
          session.playerCards = [drawCard(session), drawCard(session)];
          response = {
            type: 'cards_dealt',
            playerCards: session.playerCards,
            communityCards: [],
            phase: 'preflop',
            balance: session.balance,
          };
          break;
        case 'ultimate_tx_bet':
        case 'ultimate_tx_check':
          // Simplified - just deal community and resolve
          const community = [drawCard(session), drawCard(session), drawCard(session), drawCard(session), drawCard(session)];
          const dealerCardsUTH = [drawCard(session), drawCard(session)];
          response = {
            type: 'game_result',
            playerCards: session.playerCards,
            dealerCards: dealerCardsUTH,
            communityCards: community,
            payout: session.bet * 2,
            balance: session.balance + session.bet * 2,
            message: 'Game complete',
          };
          session.balance += session.bet * 2;
          break;
        case 'ultimate_tx_fold':
          response = {
            type: 'game_result',
            payout: 0,
            balance: session.balance,
            message: 'Folded',
          };
          break;

        default:
          response = { type: 'error', code: 'UNKNOWN_MESSAGE', message: `Unknown message type: ${message.type}` };
      }

      ws.send(JSON.stringify(response));
      console.log('Sent:', (response as any).type);

    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        code: 'PARSE_ERROR',
        message: 'Failed to parse message',
      }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  Nullspace Dev Game Server`);
  console.log(`  WebSocket: ws://0.0.0.0:${PORT}`);
  console.log(`========================================\n`);
  console.log(`Ready for connections from mobile app.\n`);
});
