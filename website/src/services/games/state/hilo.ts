import type { GameState } from '../../../types';
import { GameType } from '../../../types';
import { MAX_GRAPH_POINTS } from '../constants';
import { decodeCard } from '../shared/cards';
import type { GameStateRef, SetGameState } from './types';

type HiLoStateArgs = {
  stateBlob: Uint8Array;
  gameType: GameType;
  fallbackState: GameState;
  setGameState: SetGameState;
  gameStateRef: GameStateRef;
};

export const applyHiLoState = ({
  stateBlob,
  gameType,
  fallbackState,
  setGameState,
  gameStateRef,
}: HiLoStateArgs): void => {
  if (stateBlob.length < 9) {
    console.error('[parseGameState] HiLo state blob too short:', stateBlob.length);
    return;
  }
  const view = new DataView(stateBlob.buffer, stateBlob.byteOffset, stateBlob.byteLength);
  const currentCard = decodeCard(stateBlob[0]);
  const accumulatorBasisPoints = Number(view.getBigInt64(1, false));
  const rulesByte = stateBlob.length >= 10 ? stateBlob[9] : 0;
  const hiloRules = {
    allowSameAny: (rulesByte & 0x01) !== 0,
    tiePush: (rulesByte & 0x02) !== 0,
  };
  const hiloNextMultipliers = stateBlob.length >= 22
    ? {
        higher: view.getUint32(10, false),
        lower: view.getUint32(14, false),
        same: view.getUint32(18, false),
      }
    : null;

  setGameState((prev) => {
    const actualPot = Math.floor(prev.bet * accumulatorBasisPoints / 10000);
    const prevCards = prev.playerCards || [];
    const lastCard = prevCards.length > 0 ? prevCards[prevCards.length - 1] : null;
    const nextCards = (lastCard && lastCard.rank === currentCard.rank && lastCard.suit === currentCard.suit)
      ? prevCards
      : [...prevCards, currentCard];

    const newState: GameState = {
      ...prev,
      type: gameType,
      playerCards: nextCards,
      hiloAccumulator: actualPot,
      hiloGraphData: [...(prev.hiloGraphData || []), actualPot].slice(-MAX_GRAPH_POINTS),
      hiloRules,
      hiloNextMultipliers,
      stage: 'PLAYING',
      message: 'YOUR MOVE',
    };
    gameStateRef.current = newState;
    return newState;
  });
};
