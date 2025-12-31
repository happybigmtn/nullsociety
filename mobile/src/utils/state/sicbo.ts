export interface SicBoStateUpdate {
  dice: [number, number, number] | null;
}

export function parseSicBoState(stateBlob: Uint8Array): SicBoStateUpdate | null {
  if (stateBlob.length < 1) {
    return null;
  }
  const betCount = stateBlob[0];
  if (betCount === undefined) {
    return null;
  }
  const betsSize = betCount * 10;
  const diceOffset = 1 + betsSize;
  if (stateBlob.length < diceOffset + 3) {
    return { dice: null };
  }
  const d1 = stateBlob[diceOffset];
  const d2 = stateBlob[diceOffset + 1];
  const d3 = stateBlob[diceOffset + 2];
  if (d1 === undefined || d2 === undefined || d3 === undefined) {
    return { dice: null };
  }
  if (d1 === 0 || d2 === 0 || d3 === 0) {
    return { dice: null };
  }
  return { dice: [d1, d2, d3] };
}
