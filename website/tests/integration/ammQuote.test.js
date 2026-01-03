import { describe, test } from 'node:test';
import assert from 'node:assert';
import { estimateSwapOut, minOutWithSlippage } from '../../src/utils/ammQuote.js';
import { parseAmount } from '../../src/utils/amounts.js';

describe('ammQuote', () => {
  test('estimateSwapOut returns zeros for missing AMM', () => {
    assert.deepEqual(estimateSwapOut(null, 10n, true), { out: 0n, fee: 0n, burned: 0n });
  });

  test('estimateSwapOut vUSDT→RNG (no fee)', () => {
    const amm = { reserveRng: 1000, reserveVusdt: 1000, feeBasisPoints: 0, sellTaxBasisPoints: 0 };
    const q = estimateSwapOut(amm, 100n, true);
    assert.equal(q.burned, 0n);
    assert.equal(q.fee, 0n);
    assert.equal(q.out, 90n);
  });

  test('estimateSwapOut vUSDT→RNG (1% fee)', () => {
    const amm = { reserveRng: 1000, reserveVusdt: 1000, feeBasisPoints: 100, sellTaxBasisPoints: 0 };
    const q = estimateSwapOut(amm, 100n, true);
    assert.equal(q.burned, 0n);
    assert.equal(q.fee, 1n);
    assert.equal(q.out, 90n);
  });

  test('estimateSwapOut RNG→vUSDT (5% burn)', () => {
    const amm = { reserveRng: 1000, reserveVusdt: 1000, feeBasisPoints: 0, sellTaxBasisPoints: 500 };
    const q = estimateSwapOut(amm, 100n, false);
    assert.equal(q.burned, 5n);
    assert.equal(q.fee, 0n);
    assert.equal(q.out, 86n);
  });

  test('minOutWithSlippage clamps bps and output', () => {
    assert.equal(minOutWithSlippage(100n, 100), 99n);
    assert.equal(minOutWithSlippage(100n, -123), 100n);
    assert.equal(minOutWithSlippage(100n, 99999), 0n);
    assert.equal(minOutWithSlippage(-1n, 100), 0n);
  });
});

describe('amounts', () => {
  test('parseAmount parses integers and rejects invalid', () => {
    assert.equal(parseAmount(''), 0n);
    assert.equal(parseAmount('   '), 0n);
    assert.equal(parseAmount('0010'), 10n);
    assert.equal(parseAmount('10'), 10n);
    assert.equal(parseAmount('-1'), null);
    assert.equal(parseAmount('1.2'), null);
    assert.equal(parseAmount('nope'), null);
  });
});

