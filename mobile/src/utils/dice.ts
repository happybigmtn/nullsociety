/**
 * Dice utility functions for Craps and Sic Bo games
 */

export const DICE_FACES = ['', '\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685'] as const;

/**
 * Get the Unicode die face character for a given dice value (1-6)
 */
export function getDieFace(value: number): string {
  if (value < 1 || value > 6) {
    return '?';
  }
  return DICE_FACES[value] ?? '?';
}

/**
 * Calculate the sum of dice values
 */
export function getDiceTotal(dice: number[]): number {
  return dice.reduce((sum, die) => sum + die, 0);
}
