import type { GameState } from '../../../types';
import { GameType } from '../../../types';
import { decodeCard } from '../shared/cards';
import type { GameStateRef, SetGameState } from './types';

type CasinoWarStateArgs = {
  stateBlob: Uint8Array;
  gameType: GameType;
  setGameState: SetGameState;
  gameStateRef: GameStateRef;
};

export const applyCasinoWarState = ({
  stateBlob,
  gameType,
  setGameState,
  gameStateRef,
}: CasinoWarStateArgs): void => {
  const looksLikeV1 = stateBlob.length >= 12 && stateBlob[0] === 1;

  if (looksLikeV1) {
    const stage = stateBlob[1];
    const playerCardByte = stateBlob[2];
    const dealerCardByte = stateBlob[3];
    const tieBet = Number(
      new DataView(stateBlob.buffer, stateBlob.byteOffset + 4, 8).getBigUint64(0, false),
    );

    const playerCard = stage === 0 ? null : decodeCard(playerCardByte);
    const dealerCard = stage === 0 ? null : decodeCard(dealerCardByte);

    setGameState((prev) => {
      const shouldRecordTieCredit =
        stage === 1 && tieBet > 0 && (prev.sessionInterimPayout || 0) === 0;
      const tieCredit = shouldRecordTieCredit ? tieBet * 11 : (prev.sessionInterimPayout || 0);

      const newState: GameState = {
        ...prev,
        type: gameType,
        playerCards: playerCard ? [playerCard] : [],
        dealerCards: dealerCard ? [dealerCard] : [],
        casinoWarTieBet: tieBet,
        casinoWarOutcome: null,
        sessionInterimPayout: stage === 0 ? 0 : tieCredit,
        stage: stage === 0 ? 'BETTING' : 'PLAYING',
        message:
          stage === 0
            ? 'PLACE BETS & DEAL'
            : stage === 1
              ? 'WAR! GO TO WAR (W) / SURRENDER (S)'
              : 'DEALT',
      };
      gameStateRef.current = newState;
      return newState;
    });
    return;
  }

  if (stateBlob.length < 3) {
    console.error('[parseGameState] Casino War state blob too short:', stateBlob.length);
    return;
  }
  const playerCard = decodeCard(stateBlob[0]);
  const dealerCard = decodeCard(stateBlob[1]);
  const stage = stateBlob[2];

  setGameState((prev) => {
    const newState: GameState = {
      ...prev,
      type: gameType,
      playerCards: [playerCard],
      dealerCards: [dealerCard],
      casinoWarOutcome: null,
      stage: 'PLAYING',
      message: stage === 1 ? 'WAR! GO TO WAR (W) / SURRENDER (S)' : 'DEALT',
    };
    gameStateRef.current = newState;
    return newState;
  });
};
