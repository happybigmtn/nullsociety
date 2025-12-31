export const FREEROLL_DAILY_LIMIT_FREE = 1;
export const FREEROLL_REGISTRATION_MS = 60_000;
export const FREEROLL_TOURNAMENT_MS = 5 * 60_000;
export const FREEROLL_CYCLE_MS = FREEROLL_REGISTRATION_MS + FREEROLL_TOURNAMENT_MS;

export const getFreerollSchedule = (nowMs: number) => {
  const slot = Math.floor(nowMs / FREEROLL_CYCLE_MS);
  const slotStartMs = slot * FREEROLL_CYCLE_MS;
  const startTimeMs = slotStartMs + FREEROLL_REGISTRATION_MS;
  const endTimeMs = startTimeMs + FREEROLL_TOURNAMENT_MS;
  return { slot, tournamentId: slot, slotStartMs, startTimeMs, endTimeMs, isRegistration: nowMs < startTimeMs };
};
