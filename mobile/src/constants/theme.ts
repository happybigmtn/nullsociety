/**
 * Jony Ive-inspired design system constants
 * Following principles: Radical Simplicity, Progressive Disclosure, Clarity, Tactile Response
 */

import { Platform } from 'react-native';

const FONT_FAMILY = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export const COLORS = {
  // Core palette
  background: '#050505',
  surface: '#0A0A0A',
  surfaceElevated: '#111111',
  border: '#333333',

  // Primary actions
  primary: '#00FF41',
  primaryDark: '#00CC33',

  // Secondary/accent
  accent: '#FF003C',
  gold: '#FFD700',

  // Text hierarchy
  textPrimary: '#E5E5E5',
  textSecondary: '#B3B3B3',
  textMuted: '#6B7280',
  textDisabled: '#333333',

  // Card suits
  suitRed: '#FF003C',
  suitBlack: '#1F2937',

  // Semantic
  success: '#00FF41',
  error: '#FF003C',
  warning: '#FBBF24',
  info: '#38BDF8',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const TYPOGRAPHY = {
  // Display - for large numbers (balance, bet amounts)
  displayLarge: {
    fontSize: 48,
    fontWeight: '700' as const,
    letterSpacing: -1,
    fontFamily: FONT_FAMILY,
  },
  displayMedium: {
    fontSize: 36,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
    fontFamily: FONT_FAMILY,
  },

  // Headings
  h1: {
    fontSize: 28,
    fontWeight: '700' as const,
    fontFamily: FONT_FAMILY,
  },
  h2: {
    fontSize: 24,
    fontWeight: '600' as const,
    fontFamily: FONT_FAMILY,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    fontFamily: FONT_FAMILY,
  },

  // Body
  bodyLarge: {
    fontSize: 18,
    fontWeight: 'normal' as const,
    lineHeight: 28,
    fontFamily: FONT_FAMILY,
  },
  body: {
    fontSize: 16,
    fontWeight: 'normal' as const,
    lineHeight: 24,
    fontFamily: FONT_FAMILY,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: 'normal' as const,
    lineHeight: 20,
    fontFamily: FONT_FAMILY,
  },

  // Labels
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    letterSpacing: 1,
    fontFamily: FONT_FAMILY,
  },
  caption: {
    fontSize: 12,
    fontWeight: 'normal' as const,
    fontFamily: FONT_FAMILY,
  },
} as const;

// Animation timing
export const ANIMATION = {
  fast: 150,
  normal: 300,
  slow: 500,
  spring: {
    damping: 15,
    stiffness: 150,
  },
} as const;

// Chip values
export const CHIP_VALUES = [1, 5, 25, 100, 500, 1000] as const;

// Game-specific colors
export const GAME_COLORS = {
  hi_lo: '#8B5CF6',
  blackjack: '#10B981',
  roulette: '#EF4444',
  craps: '#F59E0B',
  baccarat: '#EC4899',
  casino_war: '#6366F1',
  video_poker: '#14B8A6',
  sic_bo: '#F97316',
  three_card_poker: '#8B5CF6',
  ultimate_texas_holdem: '#EAB308',
} as const;

// Game-specific detailed colors for in-game use
export const GAME_DETAIL_COLORS = {
  roulette: {
    red: '#DC2626',
    black: '#1F2937',
    green: '#16A34A',
  },
  craps: {
    pass: '#22C55E',
    dontPass: '#EF4444',
    field: '#F59E0B',
  },
} as const;
