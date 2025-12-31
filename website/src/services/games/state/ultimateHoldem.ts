import type { Card, GameState } from '../../../types';
import { GameType } from '../../../types';
import { decodeCard } from '../shared/cards';
import type { Ref } from '../refs';
import type { GameStateRef, SetGameState } from './types';

type UltimateHoldemStateArgs = {
  stateBlob: Uint8Array;
  gameType: GameType;
  setGameState: SetGameState;
  gameStateRef: GameStateRef;
  uthBackendStageRef: Ref<number>;
};

export const applyUltimateHoldemState = ({
  stateBlob,
  gameType,
  setGameState,
  gameStateRef,
  uthBackendStageRef,
}: UltimateHoldemStateArgs): void => {
  const version = stateBlob[0];
  if (version !== 1 && version !== 2 && version !== 3) {
    console.error('[parseGameState] Unsupported Ultimate Holdem state version:', version);
    return;
  }

  const requiredLen = version === 3 ? 40 : version === 2 ? 32 : 20;
  if (stateBlob.length < requiredLen) {
    console.error('[parseGameState] Ultimate Holdem state blob too short:', stateBlob.length);
    return;
  }

  const view = new DataView(stateBlob.buffer, stateBlob.byteOffset, stateBlob.byteLength);
  const stageVal = stateBlob[1];
  uthBackendStageRef.current = stageVal;
  const pBytes = [stateBlob[2], stateBlob[3]];
  const cBytes = [stateBlob[4], stateBlob[5], stateBlob[6], stateBlob[7], stateBlob[8]];
  const dBytes = [stateBlob[9], stateBlob[10]];
  const playMult = stateBlob[11];
  const bonusBytes = version >= 2
    ? [stateBlob[12], stateBlob[13], stateBlob[14], stateBlob[15]]
    : [0xff, 0xff, 0xff, 0xff];
  const tripsBet = Number(view.getBigUint64(version === 1 ? 12 : 16, false));
  const sixCardBonusBet = version >= 2 ? Number(view.getBigUint64(24, false)) : 0;
  const progressiveBet = version === 3 ? Number(view.getBigUint64(32, false)) : 0;

  const pCards: Card[] = pBytes[0] === 0xff ? [] : pBytes.map(decodeCard);

  const community: Card[] = [];
  for (const b of cBytes) {
    if (b !== 0xff) community.push(decodeCard(b));
  }

  const dealerVisible = stageVal === 5;
  const dCards: Card[] =
    stageVal === 0 || pCards.length === 0
      ? []
      : dBytes.map((b) => ({
          ...decodeCard(b),
          isHidden: !dealerVisible,
        }));

  const bonusVisible = stageVal === 5;
  const bonusCards: Card[] =
    version >= 2 && (sixCardBonusBet > 0 || bonusBytes.some((b) => b !== 0xff))
      ? bonusBytes.map((b) => ({
          ...decodeCard(b),
          isHidden: !bonusVisible,
        }))
      : [];

  const uiStage = stageVal === 0 ? 'BETTING' : stageVal === 5 ? 'RESULT' : 'PLAYING';

  let message = 'PLACE BETS & DEAL';
  if (stageVal === 0) message = 'TRIPS (T), 6-CARD (6), PROG (J), DEAL';
  else if (stageVal === 1) message = 'CHECK (C) OR BET 3X/4X';
  else if (stageVal === 2) message = 'CHECK (C) OR BET 2X';
  else if (stageVal === 3) message = playMult > 0 ? 'REVEAL (SPACE)' : 'FOLD (F) OR BET 1X';
  else if (stageVal === 4) message = 'REVEAL (SPACE)';
  else if (stageVal === 5) message = 'GAME COMPLETE';

  setGameState((prev) => {
    const newState: GameState = {
      ...prev,
      type: gameType,
      playerCards: pCards,
      dealerCards: dCards,
      communityCards: community,
      uthTripsBet: tripsBet,
      uthSixCardBonusBet: sixCardBonusBet,
      uthProgressiveBet: progressiveBet,
      uthBonusCards: bonusCards,
      stage: uiStage,
      message,
    };
    gameStateRef.current = newState;
    return newState;
  });
};
