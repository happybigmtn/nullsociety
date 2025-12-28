/**
 * Jony Ive-inspired design system constants
 * Principles: Radical Simplicity, Progressive Disclosure, Clarity, Tactile Response
 * Palette: Titanium & Glass
 */

import { Platform } from 'react-native';

const FONT_FAMILY = Platform.select({
  ios: 'System',
  android: 'sans-serif-medium',
  default: 'System',
});

const MONO_FONT = Platform.select({
  ios: 'Courier',
  android: 'monospace',
  default: 'monospace',
});

export const COLORS = {
  // Titanium Palette
  background: '#F9F9F9', 
  surface: '#FFFFFF', 
  surfaceElevated: '#FFFFFF',
  border: '#E5E5EA', 

  // Action Colors
  primary: '#007AFF',
  primaryDark: '#005BB5',
  success: '#34C759',
  destructive: '#FF3B30',
  gold: '#FFCC00',

  // Text hierarchy
  textPrimary: '#1C1C1E', 
  textSecondary: '#636366',
  textMuted: '#8E8E93', // WCAG AA compliant on white
  textDisabled: '#D1D1D6',

  // Card suits
  suitRed: '#FF3B30',
  suitBlack: '#1C1C1E',

  // Glass
  glassLight: 'rgba(255, 255, 255, 0.75)',
  glassDark: 'rgba(28, 28, 30, 0.8)',
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
  sm: 8,
  md: 12,
  lg: 20,
  xl: 32,
  full: 9999,
} as const;

export const TYPOGRAPHY = {
  displayLarge: {
    fontSize: 48,
    fontWeight: '800' as const,
    letterSpacing: -1,
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
  },
  displayMedium: {
    fontSize: 36,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
  },
  h1: {
    fontSize: 28,
    fontWeight: '700' as const,
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
  },
  h2: {
    fontSize: 24,
    fontWeight: '600' as const,
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
  },
  bodyLarge: {
    fontSize: 18,
    fontWeight: '500' as const,
    lineHeight: 28,
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
  },
  label: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
    fontFamily: FONT_FAMILY,
    textTransform: 'uppercase' as const,
    color: COLORS.textMuted,
  },
  mono: {
    fontFamily: MONO_FONT,
    fontSize: 12,
  }
} as const;

export const ANIMATION = {
  fast: 150,
  normal: 300,
  slow: 500,
  spring: {
    damping: 20,
    stiffness: 120,
    mass: 1,
  },
} as const;

export const CHIP_VALUES = [1, 5, 25, 100, 500, 1000] as const;

export const GAME_DETAIL_COLORS = {
  roulette: {
    red: '#FF3B30',
    black: '#1C1C1E',
    green: '#34C759',
  },
  craps: {
    pass: '#34C759',
    dontPass: '#FF3B30',
    field: '#FFCC00',
  },
} as const;
