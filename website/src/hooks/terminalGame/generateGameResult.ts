import { GameState, GameType, Card } from '../../types';
import { formatRouletteNumber, getRouletteColor, formatSummaryLine } from '../../utils/gameUtils';

const formatCardLabel = (card?: Card) => (card ? `${card.rank}${card.suit}` : '?');

export const generateGameResult = (
  gameType: GameType,
  state: GameState | null,
  _netPnL: number,
): { summary: string; details: string[] } => {
  let label = 'OUTCOME PENDING';

  if (state) {
    switch (gameType) {
      case GameType.CRAPS: {
        const [d1, d2] = state.dice;
        if (state.dice.length >= 2 && d1 > 0 && d2 > 0) {
          label = `Roll: ${d1 + d2} (${d1}-${d2})`;
        }
        break;
      }
      case GameType.SIC_BO: {
        if (state.dice.length >= 3) {
          const total = state.dice.reduce((sum, die) => sum + die, 0);
          label = `Roll: ${total} (${state.dice.slice(0, 3).join('-')})`;
        }
        break;
      }
      case GameType.ROULETTE: {
        const history = state.rouletteHistory;
        const last = history.length > 0 ? history[history.length - 1] : null;
        if (typeof last === 'number' && Number.isFinite(last)) {
          label = `Roll: ${formatRouletteNumber(last)} ${getRouletteColor(last)}`;
        }
        break;
      }
      case GameType.BACCARAT: {
        if (state.playerCards.length || state.dealerCards.length) {
          const pTotal = state.baccaratPlayerTotal;
          const bTotal = state.baccaratBankerTotal;
          label = `P: ${pTotal ?? '?'}, B: ${bTotal ?? '?'}`;
        }
        break;
      }
      case GameType.BLACKJACK: {
        if (state.playerCards.length || state.dealerCards.length) {
          const pTotal = state.blackjackPlayerValue;
          const dTotal = state.blackjackDealerValue;
          label = `P: ${pTotal ?? '?'}, D: ${dTotal ?? '?'}`;
        }
        break;
      }
      case GameType.CASINO_WAR: {
        if (state.playerCards.length || state.dealerCards.length) {
          const pCard = state.playerCards[0];
          const dCard = state.dealerCards[0];
          label = `P: ${formatCardLabel(pCard)}, D: ${formatCardLabel(dCard)}`;
        }
        break;
      }
      case GameType.VIDEO_POKER: {
        if (state.playerCards.length) {
          label = `Hand: ${state.videoPokerHand ?? '?'}`;
        }
        break;
      }
      case GameType.HILO: {
        if (state.playerCards.length) {
          const last = state.playerCards[state.playerCards.length - 1];
          label = `Card: ${formatCardLabel(last)}`;
        }
        break;
      }
      case GameType.THREE_CARD: {
        if (state.playerCards.length || state.dealerCards.length) {
          const pCards = state.playerCards.slice(0, 3).map(formatCardLabel).join(' ');
          const dCards = state.dealerCards.slice(0, 3).map(formatCardLabel).join(' ');
          label = `P: ${pCards || '?'}, D: ${dCards || '?'}`;
        }
        break;
      }
      case GameType.ULTIMATE_HOLDEM: {
        if (state.playerCards.length || state.dealerCards.length) {
          const pCards = state.playerCards.slice(0, 2).map(formatCardLabel).join(' ');
          const dCards = state.dealerCards.slice(0, 2).map(formatCardLabel).join(' ');
          label = `P: ${pCards || '?'}, D: ${dCards || '?'}`;
        }
        break;
      }
      default:
        break;
    }
  }

  if (label === 'OUTCOME PENDING' && state?.message) {
    const msg = String(state.message).trim();
    const normalized = msg.toUpperCase();
    const blocked = [
      'WAITING FOR CHAIN',
      'WAITING FOR CHAIN...',
      'PLACE BETS',
      'PLACE BETS & DEAL',
      'PLACE BETS - SPACE TO ROLL',
      'BET SIZE',
      'ROLLING',
      'SPINNING',
      'DEALING',
      'TRANSACTION',
      'INSUFFICIENT FUNDS',
      'BET LOCKED',
      'AUTO PLAY FAILED',
      'PLAYING',
      'BETTING',
      'ROUND COMPLETE',
      'OUTCOME PENDING',
    ];
    const isBlocked = blocked.some((entry) => normalized.startsWith(entry));
    if (msg && !isBlocked) {
      label = msg;
    }
  }

  return { summary: formatSummaryLine(label), details: [] };
};
