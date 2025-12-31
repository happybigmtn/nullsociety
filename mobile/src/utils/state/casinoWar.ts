import type { Card } from '../../types';
import { decodeCardId, isHiddenCard } from '../cards';

export interface CasinoWarStateUpdate {
  playerCard: Card | null;
  dealerCard: Card | null;
  stage: 'betting' | 'war' | 'complete';
}

export function parseCasinoWarState(stateBlob: Uint8Array): CasinoWarStateUpdate | null {
  if (stateBlob.length < 12 || stateBlob[0] !== 1) {
    return null;
  }
  const stageByte = stateBlob[1];
  const playerRaw = stateBlob[2];
  const dealerRaw = stateBlob[3];
  if (stageByte === undefined || playerRaw === undefined || dealerRaw === undefined) {
    return null;
  }

  const playerCard = isHiddenCard(playerRaw) ? null : decodeCardId(playerRaw);
  const dealerCard = isHiddenCard(dealerRaw) ? null : decodeCardId(dealerRaw);

  const stage = stageByte === 1 ? 'war' : stageByte === 2 ? 'complete' : 'betting';

  return {
    playerCard: playerCard ?? null,
    dealerCard: dealerCard ?? null,
    stage,
  };
}
