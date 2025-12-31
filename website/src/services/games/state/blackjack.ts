import type { Card, CompletedHand, GameState } from '../../../types';
import { GameType } from '../../../types';
import { decodeCard } from '../shared/cards';
import type { GameStateRef, SetGameState } from './types';

type BlackjackStateArgs = {
  stateBlob: Uint8Array;
  gameType: GameType;
  fallbackState: GameState;
  setGameState: SetGameState;
  gameStateRef: GameStateRef;
};

export const applyBlackjackState = ({
  stateBlob,
  gameType,
  fallbackState,
  setGameState,
  gameStateRef,
}: BlackjackStateArgs): void => {
  if (stateBlob.length < 2) {
    console.error('[parseGameState] Blackjack state blob too short:', stateBlob.length);
    return;
  }

  const version = stateBlob[0];
  if (version !== 2) {
    console.error('[parseGameState] Unsupported blackjack state version:', version);
    return;
  }
  if (stateBlob.length < 14) {
    console.error('[parseGameState] Blackjack v2 state blob too short:', stateBlob.length);
    return;
  }

  const view = new DataView(stateBlob.buffer, stateBlob.byteOffset, stateBlob.byteLength);
  let offset = 0;
  offset++; // version
  const bjStage = stateBlob[offset++]; // 0=Betting,1=PlayerTurn,2=AwaitingReveal,3=Complete
  const sideBet21p3 = Number(view.getBigUint64(offset, false));
  offset += 8;
  const initP1 = stateBlob[offset++];
  const initP2 = stateBlob[offset++];
  const activeHandIdx = stateBlob[offset++];
  const handCount = stateBlob[offset++];

  const prevState = gameStateRef.current ?? fallbackState;
  const baseBet = prevState?.bet || 100;
  let pCards: Card[] = [];
  const dCards: Card[] = [];
  const pendingStack: { cards: Card[]; bet: number; isDoubled: boolean }[] = [];
  const finishedHands: CompletedHand[] = [];
  let mainWagered = handCount === 0 ? baseBet : 0;

  const allHandsFinished = activeHandIdx >= handCount;

  for (let h = 0; h < handCount; h++) {
    const betMult = stateBlob[offset++];
    const status = stateBlob[offset++]; // 0=Play, 1=Stand, 2=Bust, 3=BJ
    offset++; // was_split (unused for display)
    const cLen = stateBlob[offset++];

    const handCards: Card[] = [];
    for (let i = 0; i < cLen; i++) {
      handCards.push(decodeCard(stateBlob[offset++]));
    }

    const isDoubled = betMult === 2;
    const handBet = baseBet * betMult;
    mainWagered += handBet;

    if (!allHandsFinished && h === activeHandIdx) {
      pCards = handCards;
    } else if (allHandsFinished && h === handCount - 1) {
      pCards = handCards;
    } else if (!allHandsFinished && h > activeHandIdx) {
      pendingStack.push({ cards: handCards, bet: handBet, isDoubled });
    } else {
      let msg = '';
      if (status === 2) msg = 'BUST';
      else if (status === 3) msg = 'BLACKJACK';
      else if (status === 1) msg = 'STAND';
      else if (status === 4) msg = 'SURRENDER';
      finishedHands.push({ cards: handCards, bet: handBet, isDoubled, message: msg });
    }
  }

  const dLen = stateBlob[offset++];
  for (let i = 0; i < dLen; i++) {
    dCards.push(decodeCard(stateBlob[offset++]));
  }

  let blackjackPlayerValue: number | null = null;
  let blackjackDealerValue: number | null = null;
  let blackjackActions = {
    canHit: false,
    canStand: false,
    canDouble: false,
    canSplit: false,
  };
  if (stateBlob.length >= offset + 2) {
    offset += 2;
    if (stateBlob.length >= offset + 3) {
      blackjackPlayerValue = stateBlob[offset];
      blackjackDealerValue = stateBlob[offset + 1];
      const actionMask = stateBlob[offset + 2];
      blackjackActions = {
        canHit: (actionMask & 0x01) !== 0,
        canStand: (actionMask & 0x02) !== 0,
        canDouble: (actionMask & 0x04) !== 0,
        canSplit: (actionMask & 0x08) !== 0,
      };
    }
  }

  const isComplete = bjStage === 3;
  const uiStage = bjStage === 0 ? 'BETTING' : isComplete ? 'RESULT' : 'PLAYING';

  let message = 'PLACE BETS & DEAL';
  if (bjStage === 1) message = 'Your move';
  else if (bjStage === 2) message = 'REVEAL (SPACE)';
  else if (bjStage === 3) message = 'GAME COMPLETE';

  const dealerCardsWithVisibility = dCards.map((card, i) => ({
    ...card,
    isHidden: !isComplete && i > 0,
  }));

  const totalWagered = mainWagered + sideBet21p3;
  const newState: GameState = {
    ...prevState,
    type: gameType,
    playerCards:
      bjStage === 0 || initP1 === 0xff || initP2 === 0xff
        ? []
        : pCards,
    dealerCards: bjStage === 0 ? [] : dealerCardsWithVisibility,
    blackjackStack: pendingStack,
    completedHands: finishedHands,
    blackjack21Plus3Bet: sideBet21p3,
    blackjackPlayerValue,
    blackjackDealerValue,
    blackjackActions,
    sessionWager: totalWagered,
    stage: uiStage,
    message,
  };
  gameStateRef.current = newState;
  setGameState(newState);
};
