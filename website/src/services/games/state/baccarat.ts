import type { Card, GameState } from '../../../types';
import { GameType } from '../../../types';
import { decodeCard } from '../shared/cards';
import type { GameStateRef, SetGameState } from './types';

type BaccaratStateArgs = {
  stateBlob: Uint8Array;
  gameType: GameType;
  fallbackState: GameState;
  setGameState: SetGameState;
  gameStateRef: GameStateRef;
};

export const applyBaccaratState = ({
  stateBlob,
  gameType,
  fallbackState,
  setGameState,
  gameStateRef,
}: BaccaratStateArgs): void => {
  if (stateBlob.length < 1) {
    console.error('[parseGameState] Baccarat state blob too short:', stateBlob.length);
    return;
  }

  const betCount = stateBlob[0];
  const betsSize = betCount * 9;
  const cardsStartOffset = 1 + betsSize;

  if (stateBlob.length <= cardsStartOffset) {
    setGameState((prev) => ({
      ...prev,
      type: gameType,
      playerCards: [],
      dealerCards: [],
      baccaratPlayerTotal: null,
      baccaratBankerTotal: null,
      stage: 'PLAYING',
      message: 'PLACE BETS & DEAL',
    }));
    return;
  }

  let offset = cardsStartOffset;
  const pLen = stateBlob[offset++];

  if (stateBlob.length < offset + pLen + 1) {
    console.error(
      '[parseGameState] Baccarat state blob too short for player cards:',
      stateBlob.length,
      'need',
      offset + pLen + 1,
    );
    return;
  }

  const pCards: Card[] = [];
  for (let i = 0; i < pLen && offset < stateBlob.length; i++) {
    pCards.push(decodeCard(stateBlob[offset++]));
  }

  const bLen = offset < stateBlob.length ? stateBlob[offset++] : 0;
  const bCards: Card[] = [];
  for (let i = 0; i < bLen && offset < stateBlob.length; i++) {
    bCards.push(decodeCard(stateBlob[offset++]));
  }

  if (pCards.length === 0 && bCards.length === 0) {
    setGameState((prev) => ({
      ...prev,
      type: gameType,
      playerCards: [],
      dealerCards: [],
      stage: 'PLAYING',
      message: 'PLACE BETS & DEAL',
    }));
    return;
  }

  const prevState = gameStateRef.current ?? fallbackState;
  const newState: GameState = {
    ...prevState,
    type: gameType,
    playerCards: pCards,
    dealerCards: bCards,
    baccaratPlayerTotal: null,
    baccaratBankerTotal: null,
    stage: 'RESULT',
    message: 'BACCARAT DEALT',
  };
  gameStateRef.current = newState;
  setGameState(newState);
};
