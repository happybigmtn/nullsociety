import type { Card, GameState } from '../../../types';
import { GameType } from '../../../types';
import { decodeCard } from '../shared/cards';
import type { GameStateRef, SetGameState } from './types';

type VideoPokerStateArgs = {
  stateBlob: Uint8Array;
  gameType: GameType;
  setGameState: SetGameState;
  gameStateRef: GameStateRef;
};

export const applyVideoPokerState = ({
  stateBlob,
  gameType,
  setGameState,
  gameStateRef,
}: VideoPokerStateArgs): void => {
  if (stateBlob.length < 6) {
    console.error('[parseGameState] Video Poker state blob too short:', stateBlob.length);
    return;
  }
  const stage = stateBlob[0];
  const cards: Card[] = [];
  for (let i = 1; i <= 5 && i < stateBlob.length; i++) {
    cards.push(decodeCard(stateBlob[i]));
  }

  if (gameStateRef.current) {
    gameStateRef.current = {
      ...gameStateRef.current,
      playerCards: cards,
    };
  }

  setGameState((prev) => {
    const cardsWithHolds =
      stage === 0
        ? cards.map((c, i) => ({
            ...c,
            isHeld: prev.playerCards?.[i]?.isHeld,
          }))
        : cards;
    const newState: GameState = {
      ...prev,
      type: gameType,
      playerCards: cardsWithHolds,
      videoPokerHand: stage === 1 ? prev.videoPokerHand : null,
      videoPokerMultiplier: stage === 1 ? prev.videoPokerMultiplier : null,
      stage: stage === 1 ? 'RESULT' : 'PLAYING',
      message: stage === 0 ? 'HOLD (1-5), DRAW (D)' : 'GAME COMPLETE',
    };
    gameStateRef.current = newState;
    return newState;
  });
};
