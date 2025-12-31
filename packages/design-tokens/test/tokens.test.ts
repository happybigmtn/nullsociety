import { describe, it, expect } from 'vitest';
import { ACTION, GAME, TITANIUM } from '../src/colors.js';
import { SPACING, SPACING_SEMANTIC } from '../src/spacing.js';
import { FONTS, TYPE_SCALE, FONT_WEIGHTS } from '../src/typography.js';
import { DURATION, SPRING } from '../src/animations.js';
import { ELEVATION, GLOW, SHADOW } from '../src/shadows.js';

describe('design tokens', () => {
  it('defines color palettes and game schemes', () => {
    expect(TITANIUM[50]).toMatch(/^#/);
    expect(ACTION.indigo).toMatch(/^#/);
    for (const scheme of Object.values(GAME)) {
      expect(scheme.primary).toMatch(/^#/);
      expect(scheme.accent).toMatch(/^#/);
    }
  });

  it('keeps spacing tokens aligned', () => {
    expect(SPACING_SEMANTIC.md).toBe(SPACING[4]);
    expect(SPACING_SEMANTIC.lg).toBe(SPACING[6]);
  });

  it('defines typography families and weights', () => {
    expect(FONTS.display.length).toBeGreaterThan(0);
    expect(TYPE_SCALE.body.size).toBeGreaterThan(0);
    expect(FONT_WEIGHTS.bold).toBeGreaterThan(FONT_WEIGHTS.regular);
  });

  it('includes animation presets and durations', () => {
    expect(SPRING.button.stiffness).toBeGreaterThan(0);
    expect(DURATION.fast).toBeLessThan(DURATION.slow);
  });

  it('maps elevations to shadow levels', () => {
    for (const level of Object.values(ELEVATION)) {
      expect(SHADOW[level]).toBeDefined();
    }
    for (const glow of Object.values(GLOW)) {
      expect(glow.blur).toBeGreaterThan(0);
    }
  });
});
