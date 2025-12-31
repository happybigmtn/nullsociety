import type { Card } from '../../types';
import { decodeCardId } from '../cards';
import { readI64BE } from './shared';

export interface HiLoStateUpdate {
  currentCard: Card | null;
  accumulator: number | null;
}

export function parseHiLoState(stateBlob: Uint8Array): HiLoStateUpdate | null {
  if (stateBlob.length < 9) {
    return null;
  }
  const cardId = stateBlob[0];
  if (cardId === undefined) {
    return null;
  }
  const card = decodeCardId(cardId);
  const view = new DataView(stateBlob.buffer, stateBlob.byteOffset, stateBlob.byteLength);
  const accumulator = Number(readI64BE(view, 1));
  return {
    currentCard: card,
    accumulator: Number.isFinite(accumulator) ? accumulator : null,
  };
}
