import type { GameState } from '../../../types';
import { GameType } from '../../../types';
import { MAX_GRAPH_POINTS } from '../constants';
import { formatRouletteNumber } from '../../../utils/gameUtils';
import type { GameStateRef, SetGameState } from './types';

type RouletteStateArgs = {
  stateBlob: Uint8Array;
  gameType: GameType;
  setGameState: SetGameState;
  gameStateRef: GameStateRef;
};

export const applyRouletteState = ({
  stateBlob,
  gameType,
  setGameState,
  gameStateRef,
}: RouletteStateArgs): void => {
  if (stateBlob.length < 1) {
    console.error('[parseGameState] Roulette state blob too short:', stateBlob.length);
    return;
  }

  const betCount = stateBlob[0];
  const betsSize = betCount * 10;
  const legacyResultOffset = 1 + betsSize;
  const v2HeaderLen = 19;
  const v2ResultOffset = v2HeaderLen + betsSize;
  const looksLikeV2 =
    stateBlob.length === v2HeaderLen + betsSize || stateBlob.length === v2HeaderLen + betsSize + 1;

  const zeroRuleByte = looksLikeV2 ? stateBlob[1] : 0;
  const phaseByte = looksLikeV2 ? stateBlob[2] : 0;
  const resultOffset = looksLikeV2 ? v2ResultOffset : legacyResultOffset;

  const zeroRule =
    zeroRuleByte === 1
      ? 'LA_PARTAGE'
      : zeroRuleByte === 2
        ? 'EN_PRISON'
        : zeroRuleByte === 3
          ? 'EN_PRISON_DOUBLE'
          : zeroRuleByte === 4
            ? 'AMERICAN'
            : 'STANDARD';
  const rouletteIsPrison = phaseByte === 1;

  if (stateBlob.length > resultOffset) {
    const result = stateBlob[resultOffset];

    if (gameStateRef.current) {
      gameStateRef.current = {
        ...gameStateRef.current,
        rouletteHistory: [...(gameStateRef.current.rouletteHistory || []), result].slice(-MAX_GRAPH_POINTS),
      };
    }

    setGameState((prev) => ({
      ...prev,
      type: gameType,
      rouletteZeroRule: zeroRule,
      rouletteIsPrison,
      rouletteHistory: [...prev.rouletteHistory, result].slice(-MAX_GRAPH_POINTS),
      stage: rouletteIsPrison && result === 0 ? 'PLAYING' : 'RESULT',
      message: rouletteIsPrison && result === 0
        ? 'EN PRISON - SPACE TO SPIN'
        : `LANDED ON ${formatRouletteNumber(result)}`,
    }));
  } else {
    setGameState((prev) => ({
      ...prev,
      type: gameType,
      rouletteZeroRule: zeroRule,
      rouletteIsPrison,
      stage: 'PLAYING',
      message: rouletteIsPrison ? 'EN PRISON - SPACE TO SPIN' : 'PLACE YOUR BETS',
    }));
  }
};
