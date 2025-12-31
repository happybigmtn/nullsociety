import type { GameState } from '../../../types';
import { GameType } from '../../../types';
import { MAX_GRAPH_POINTS } from '../constants';
import type { GameStateRef, SetGameState } from './types';

type SicBoStateArgs = {
  stateBlob: Uint8Array;
  gameType: GameType;
  setGameState: SetGameState;
  gameStateRef: GameStateRef;
};

export const applySicBoState = ({
  stateBlob,
  gameType,
  setGameState,
  gameStateRef,
}: SicBoStateArgs): void => {
  if (stateBlob.length < 1) {
    console.error('[parseGameState] SicBo state blob too short:', stateBlob.length);
    return;
  }

  const betCount = stateBlob[0];
  const betsSize = betCount * 10;
  const diceOffset = 1 + betsSize;

  if (stateBlob.length >= diceOffset + 3) {
    const dice: [number, number, number] = [
      stateBlob[diceOffset],
      stateBlob[diceOffset + 1],
      stateBlob[diceOffset + 2],
    ];
    const total = dice[0] + dice[1] + dice[2];

    if (gameStateRef.current) {
      gameStateRef.current = {
        ...gameStateRef.current,
        dice,
        sicBoHistory: [...(gameStateRef.current.sicBoHistory || []), dice].slice(-MAX_GRAPH_POINTS),
      };
    }

    setGameState((prev) => ({
      ...prev,
      type: gameType,
      dice,
      sicBoHistory: [...prev.sicBoHistory, dice].slice(-MAX_GRAPH_POINTS),
      stage: 'RESULT',
      message: `ROLLED ${total} (${dice.join('-')})`,
    }));
  } else {
    setGameState((prev) => ({
      ...prev,
      type: gameType,
      stage: 'PLAYING',
      message: 'PLACE YOUR BETS',
    }));
  }
};
