export interface RouletteStateUpdate {
  result: number | null;
  isPrison: boolean;
}

export function parseRouletteState(stateBlob: Uint8Array): RouletteStateUpdate | null {
  if (stateBlob.length < 1) {
    return null;
  }
  const betCount = stateBlob[0];
  if (betCount === undefined) {
    return null;
  }
  const betsSize = betCount * 10;
  const legacyResultOffset = 1 + betsSize;
  const v2HeaderLen = 19;
  const v2ResultOffset = v2HeaderLen + betsSize;
  const looksLikeV2 =
    stateBlob.length === v2HeaderLen + betsSize || stateBlob.length === v2HeaderLen + betsSize + 1;

  const phaseByte = looksLikeV2 ? stateBlob[2] : 0;
  const resultOffset = looksLikeV2 ? v2ResultOffset : legacyResultOffset;

  const result = stateBlob.length > resultOffset ? stateBlob[resultOffset] ?? null : null;

  return {
    result,
    isPrison: phaseByte === 1,
  };
}
