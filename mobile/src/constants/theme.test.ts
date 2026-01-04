import { COLORS, SPACING, RADIUS, TYPOGRAPHY, GAME_COLORS } from './theme';

describe('theme constants', () => {
  it('exports core design tokens', () => {
    expect(COLORS.background).toBeDefined();
    expect(SPACING.md).toBeDefined();
    expect(RADIUS.lg).toBeDefined();
    expect(TYPOGRAPHY.h1).toBeDefined();
  });

  it('exposes game color mappings', () => {
    expect(GAME_COLORS.blackjack).toBeDefined();
    expect(GAME_COLORS.roulette).toBeDefined();
  });
});
