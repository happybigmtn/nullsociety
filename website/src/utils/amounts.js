/**
 * Amount parsing helpers.
 */

/**
 * Parse an integer amount from user input.
 * Returns:
 * - `0n` for empty input (treat as zero)
 * - `null` for invalid/negative input
 * - bigint for valid non-negative integers
 *
 * @param {string} input
 * @returns {bigint|null}
 */
export function parseAmount(input) {
  const trimmed = (input ?? '').toString().trim();
  if (!trimmed) return 0n;
  try {
    const n = BigInt(trimmed);
    if (n < 0n) return null;
    return n;
  } catch {
    return null;
  }
}

