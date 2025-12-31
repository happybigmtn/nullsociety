import type { GameState } from '../../../types';
import { GameType } from '../../../types';
import type { Ref } from '../refs';
import type { CrapsChainRollLog } from '../crapsLogs';
import { applyBaccaratState } from './baccarat';
import { applyBlackjackState } from './blackjack';
import { applyCasinoWarState } from './casinoWar';
import { applyCrapsState } from './craps';
import { applyHiLoState } from './hilo';
import { applyRouletteState } from './roulette';
import { applySicBoState } from './sicbo';
import { applyThreeCardState } from './threeCard';
import { applyUltimateHoldemState } from './ultimateHoldem';
import { applyVideoPokerState } from './videoPoker';
import type { GameStateRef, SetGameState } from './types';

type ApplyGameStateArgs = {
  stateBlob: Uint8Array;
  gameType: GameType;
  fallbackState: GameState;
  setGameState: SetGameState;
  gameStateRef: GameStateRef;
  isPendingRef: Ref<boolean>;
  crapsChainRollLogRef: Ref<{ sessionId: bigint; roll: CrapsChainRollLog } | null>;
  uthBackendStageRef: Ref<number>;
};

export const applyGameStateFromBlob = ({
  stateBlob,
  gameType,
  fallbackState,
  setGameState,
  gameStateRef,
  isPendingRef,
  crapsChainRollLogRef,
  uthBackendStageRef,
}: ApplyGameStateArgs): void => {
  switch (gameType) {
    case GameType.BLACKJACK:
      applyBlackjackState({ stateBlob, gameType, fallbackState, setGameState, gameStateRef });
      break;
    case GameType.HILO:
      applyHiLoState({ stateBlob, gameType, fallbackState, setGameState, gameStateRef });
      break;
    case GameType.BACCARAT:
      applyBaccaratState({ stateBlob, gameType, fallbackState, setGameState, gameStateRef });
      break;
    case GameType.VIDEO_POKER:
      applyVideoPokerState({ stateBlob, gameType, setGameState, gameStateRef });
      break;
    case GameType.CASINO_WAR:
      applyCasinoWarState({ stateBlob, gameType, setGameState, gameStateRef });
      break;
    case GameType.CRAPS:
      applyCrapsState({
        stateBlob,
        gameType,
        fallbackState,
        setGameState,
        gameStateRef,
        isPendingRef,
        crapsChainRollLogRef,
      });
      break;
    case GameType.ROULETTE:
      applyRouletteState({ stateBlob, gameType, setGameState, gameStateRef });
      break;
    case GameType.SIC_BO:
      applySicBoState({ stateBlob, gameType, setGameState, gameStateRef });
      break;
    case GameType.THREE_CARD:
      applyThreeCardState({ stateBlob, gameType, setGameState, gameStateRef });
      break;
    case GameType.ULTIMATE_HOLDEM:
      applyUltimateHoldemState({
        stateBlob,
        gameType,
        setGameState,
        gameStateRef,
        uthBackendStageRef,
      });
      break;
    default:
      break;
  }
};
