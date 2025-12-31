import type { Card, GameState } from '../../../types';
import { GameType } from '../../../types';
import { decodeCard } from '../shared/cards';
import type { GameStateRef, SetGameState } from './types';

type ThreeCardStateArgs = {
  stateBlob: Uint8Array;
  gameType: GameType;
  setGameState: SetGameState;
  gameStateRef: GameStateRef;
};

export const applyThreeCardState = ({
  stateBlob,
  gameType,
  setGameState,
  gameStateRef,
}: ThreeCardStateArgs): void => {
  const version = stateBlob[0];
  if (version !== 1 && version !== 2 && version !== 3) {
    console.error('[parseGameState] Unsupported Three Card state version:', version);
    return;
  }

  const requiredLen = version === 3 ? 32 : version === 2 ? 24 : 16;
  if (stateBlob.length < requiredLen) {
    console.error('[parseGameState] Three Card state blob too short:', stateBlob.length);
    return;
  }

  const view = new DataView(stateBlob.buffer, stateBlob.byteOffset, stateBlob.byteLength);
  const stageVal = stateBlob[1];
  const pairplusBet = Number(view.getBigUint64(8, false));
  const sixCardBonusBet = version >= 2 ? Number(view.getBigUint64(16, false)) : 0;
  const progressiveBet = version === 3 ? Number(view.getBigUint64(24, false)) : 0;

  const pBytes = [stateBlob[2], stateBlob[3], stateBlob[4]];
  const dBytes = [stateBlob[5], stateBlob[6], stateBlob[7]];

  const pCards: Card[] = stageVal === 0 ? [] : pBytes.map(decodeCard);
  const dCards: Card[] =
    stageVal === 0
      ? []
      : dBytes.map((b) => ({
          ...decodeCard(b),
          isHidden: stageVal !== 3,
        }));

  const uiStage = stageVal === 0 ? 'BETTING' : stageVal === 3 ? 'RESULT' : 'PLAYING';

  let message = 'PLACE BETS & DEAL';
  if (stageVal === 0) message = 'PAIRPLUS (P), 6-CARD (6), PROG (J), DEAL';
  else if (stageVal === 1) message = 'PLAY (P) OR FOLD (F)';
  else if (stageVal === 2) message = 'REVEAL (SPACE)';
  else if (stageVal === 3) message = 'GAME COMPLETE';

  setGameState((prev) => {
    const newState: GameState = {
      ...prev,
      type: gameType,
      playerCards: pCards,
      dealerCards: dCards,
      threeCardPairPlusBet: pairplusBet,
      threeCardSixCardBonusBet: sixCardBonusBet,
      threeCardProgressiveBet: progressiveBet,
      threeCardPlayerRank: null,
      threeCardDealerRank: null,
      threeCardDealerQualifies: null,
      stage: uiStage,
      message,
    };
    gameStateRef.current = newState;
    return newState;
  });
};
