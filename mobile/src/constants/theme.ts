/**
 * Jony Ive-inspired design system constants
 * Following principles: Radical Simplicity, Progressive Disclosure, Clarity, Tactile Response
 */

export const COLORS = {
  // Core palette
  background: '#0A0A0A',
  surface: '#141414',
  surfaceElevated: '#1A1A1A',
  border: '#2A2A2A',

  // Primary actions
  primary: '#00FF00',
  primaryDark: '#00CC00',

  // Secondary/accent
  accent: '#FF4444',
  gold: '#FFD700',

  // Text hierarchy
  textPrimary: '#FFFFFF',
  textSecondary: '#888888',
  textMuted: '#666666',
  textDisabled: '#444444',

  // Card suits
  suitRed: '#EF4444',
  suitBlack: '#1F2937',

  // Semantic
  success: '#22C55E',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
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
    fontWeight: 'bold' as const,
    letterSpacing: -1,
  },
  displayMedium: {
    fontSize: 36,
    fontWeight: 'bold' as const,
    letterSpacing: -0.5,
  },

  // Headings
  h1: {
    fontSize: 28,
    fontWeight: 'bold' as const,
  },
  h2: {
    fontSize: 24,
    fontWeight: '600' as const,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
  },

  // Body
  bodyLarge: {
    fontSize: 18,
    fontWeight: 'normal' as const,
    lineHeight: 28,
  },
  body: {
    fontSize: 16,
    fontWeight: 'normal' as const,
    lineHeight: 24,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: 'normal' as const,
    lineHeight: 20,
  },

  // Labels
  label: {
    fontSize: 14,
    fontWeight: '500' as const,
    letterSpacing: 0.5,
  },
  caption: {
    fontSize: 12,
    fontWeight: 'normal' as const,
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
