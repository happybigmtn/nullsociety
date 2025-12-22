import { describe, expect, it } from 'vitest';
import { CardPeekAnimator } from './CardPeekAnimation';

describe('CardPeekAnimator', () => {
  it('starts at 0 and returns to 0 by the end', () => {
    const animator = new CardPeekAnimator({ durationMs: 1000, liftAngleRad: 0.5 });
    expect(animator.getOffset(0)).toBeCloseTo(0, 6);
    expect(animator.getOffset(1000)).toBeCloseTo(0, 6);
  });

  it('reaches lift during hold', () => {
    const animator = new CardPeekAnimator({ durationMs: 1000, liftAngleRad: 0.5 });
    const offset = animator.getOffset(500);
    expect(offset).toBeCloseTo(0.5, 2);
  });
});
