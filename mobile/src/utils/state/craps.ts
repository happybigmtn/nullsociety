export interface CrapsStateUpdate {
  dice: [number, number] | null;
  point: number | null;
  phase: 'comeout' | 'point';
}

export function parseCrapsState(stateBlob: Uint8Array): CrapsStateUpdate | null {
  if (stateBlob.length < 5) {
    return null;
  }
  const version = stateBlob[0];
  const phaseByte = stateBlob[1];
  const mainPoint = stateBlob[2];
  const d1 = stateBlob[3];
  const d2 = stateBlob[4];
  if (
    version === undefined
    || phaseByte === undefined
    || mainPoint === undefined
    || d1 === undefined
    || d2 === undefined
  ) {
    return null;
  }

  if (version < 1) {
    return null;
  }

  return {
    dice: d1 > 0 && d2 > 0 ? [d1, d2] : null,
    point: mainPoint > 0 ? mainPoint : null,
    phase: phaseByte === 1 ? 'point' : 'comeout',
  };
}
