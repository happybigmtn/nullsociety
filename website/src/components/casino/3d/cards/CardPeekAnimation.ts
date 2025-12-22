export interface CardPeekConfig {
  durationMs?: number;
  liftAngleRad?: number;
  liftPortion?: number;
  holdPortion?: number;
}

export class CardPeekAnimator {
  private durationMs: number;
  private liftAngleRad: number;
  private liftPortion: number;
  private holdPortion: number;

  constructor(config: CardPeekConfig = {}) {
    this.durationMs = config.durationMs ?? 800;
    this.liftAngleRad = config.liftAngleRad ?? (15 * Math.PI) / 180;
    this.liftPortion = config.liftPortion ?? 0.3;
    this.holdPortion = config.holdPortion ?? 0.5;
  }

  getOffset(elapsedMs: number): number {
    if (this.durationMs <= 0) return 0;
    const t = Math.min(1, Math.max(0, elapsedMs / this.durationMs));
    const liftEnd = this.liftPortion;
    const holdEnd = Math.min(1, liftEnd + this.holdPortion);

    if (t <= liftEnd) {
      return this.liftAngleRad * (t / liftEnd);
    }
    if (t <= holdEnd) {
      return this.liftAngleRad;
    }

    const releaseT = (t - holdEnd) / Math.max(0.0001, 1 - holdEnd);
    return this.liftAngleRad * (1 - releaseT);
  }
}
