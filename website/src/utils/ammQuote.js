/**
 * AMM quote helpers (integer math, bigint-safe).
 */

/**
 * Estimate swap output (constant product with fee + optional sell burn).
 *
 * Expected AMM shape (as returned by chain state):
 * - reserveRng
 * - reserveVusdt
 * - feeBasisPoints
 * - sellTaxBasisPoints
 *
 * @param {any} amm
 * @param {bigint} amountIn
 * @param {boolean} isBuyingRng - true for vUSDT→RNG, false for RNG→vUSDT
 * @returns {{ out: bigint, fee: bigint, burned: bigint }}
 */
export function estimateSwapOut(amm, amountIn, isBuyingRng) {
  if (!amm) return { out: 0n, fee: 0n, burned: 0n };
  if (typeof amountIn !== 'bigint' || amountIn <= 0n) return { out: 0n, fee: 0n, burned: 0n };

  const reserveRng = BigInt(amm.reserveRng ?? 0);
  const reserveVusdt = BigInt(amm.reserveVusdt ?? 0);
  const feeBps = BigInt(amm.feeBasisPoints ?? 0);
  const sellTaxBps = BigInt(amm.sellTaxBasisPoints ?? 0);

  if (reserveRng <= 0n || reserveVusdt <= 0n) return { out: 0n, fee: 0n, burned: 0n };

  let burned = 0n;
  let effectiveIn = amountIn;
  let reserveIn = reserveVusdt;
  let reserveOut = reserveRng;

  if (!isBuyingRng) {
    reserveIn = reserveRng;
    reserveOut = reserveVusdt;
    burned = (amountIn * sellTaxBps) / 10_000n;
    effectiveIn = amountIn - burned;
    if (effectiveIn <= 0n) return { out: 0n, fee: 0n, burned };
  }

  const fee = (effectiveIn * feeBps) / 10_000n;
  const netIn = effectiveIn - fee;
  if (netIn <= 0n) return { out: 0n, fee, burned };

  const denom = reserveIn + netIn;
  if (denom <= 0n) return { out: 0n, fee, burned };

  const out = (netIn * reserveOut) / denom;
  return { out, fee, burned };
}

/**
 * Compute min received given a slippage tolerance in basis points.
 * @param {bigint} out
 * @param {number} slippageBps
 * @returns {bigint}
 */
export function minOutWithSlippage(out, slippageBps) {
  const safeOut = typeof out === 'bigint' && out > 0n ? out : 0n;
  const bps = Number.isFinite(slippageBps) ? Math.max(0, Math.min(10_000, Math.floor(slippageBps))) : 0;
  return (safeOut * BigInt(10_000 - bps)) / 10_000n;
}

