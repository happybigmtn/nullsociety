import { describe, it, expect } from 'vitest';
import { buildReplayFingerprint, buildReplaySample } from '../engine/replayHarness';
import { generateRoundSeed } from '../engine/deterministicRng';

describe('deterministic replay harness', () => {
  describe('seed generation', () => {
    it('produces identical seed for same roundId + gameType', () => {
      const seed1 = generateRoundSeed('roulette', 42);
      const seed2 = generateRoundSeed('roulette', 42);
      expect(seed1).toBe(seed2);
    });

    it('produces different seeds for different gameTypes', () => {
      const rouletteSeed = generateRoundSeed('roulette', 42);
      const crapsSeed = generateRoundSeed('craps', 42);
      expect(rouletteSeed).not.toBe(crapsSeed);
    });

    it('produces different seeds for different roundIds', () => {
      const seed1 = generateRoundSeed('roulette', 42);
      const seed2 = generateRoundSeed('roulette', 43);
      expect(seed1).not.toBe(seed2);
    });

    it('produces valid 32-bit unsigned integer seeds', () => {
      const seed = generateRoundSeed('blackjack', 12345);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xFFFFFFFF);
      expect(Number.isInteger(seed)).toBe(true);
    });
  });

  describe('buildReplayFingerprint', () => {
    it('returns stable fingerprints for the same inputs', () => {
      const first = buildReplayFingerprint('roulette', 42, 16);
      const second = buildReplayFingerprint('roulette', 42, 16);
      expect(first).toBe(second);
    });

    it('changes fingerprints when the round id changes', () => {
      const first = buildReplayFingerprint('roulette', 42, 16);
      const second = buildReplayFingerprint('roulette', 43, 16);
      expect(first).not.toBe(second);
    });

    it('changes fingerprints when the game type changes', () => {
      const rouletteFingerprint = buildReplayFingerprint('roulette', 42, 16);
      const crapsFingerprint = buildReplayFingerprint('craps', 42, 16);
      expect(rouletteFingerprint).not.toBe(crapsFingerprint);
    });

    it('returns 8-character hex string', () => {
      const fingerprint = buildReplayFingerprint('baccarat', 100, 32);
      expect(fingerprint).toMatch(/^[0-9a-f]{8}$/);
    });

    it('produces different fingerprints for different sample counts', () => {
      const small = buildReplayFingerprint('sicbo', 50, 8);
      const large = buildReplayFingerprint('sicbo', 50, 64);
      expect(small).not.toBe(large);
    });
  });

  describe('buildReplaySample', () => {
    it('returns consistent results for same inputs', () => {
      const sample1 = buildReplaySample('roulette', 42, 12);
      const sample2 = buildReplaySample('roulette', 42, 12);

      expect(sample1.gameType).toBe(sample2.gameType);
      expect(sample1.roundId).toBe(sample2.roundId);
      expect(sample1.seed).toBe(sample2.seed);
      expect(sample1.sample).toEqual(sample2.sample);
      expect(sample1.fingerprint).toBe(sample2.fingerprint);
    });

    it('includes correct metadata', () => {
      const result = buildReplaySample('blackjack', 123, 16);

      expect(result.gameType).toBe('blackjack');
      expect(result.roundId).toBe(123);
      expect(result.seed).toBeGreaterThan(0);
      expect(result.sample).toHaveLength(16);
      expect(result.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    });

    it('clamps sample count to valid range', () => {
      const tooSmall = buildReplaySample('craps', 1, 0);
      expect(tooSmall.sample).toHaveLength(1);

      const tooLarge = buildReplaySample('craps', 1, 200);
      expect(tooLarge.sample).toHaveLength(128);
    });

    it('produces deterministic sample values', () => {
      const result = buildReplaySample('roulette', 999, 8);

      result.sample.forEach(value => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1_000_000);
        expect(Number.isInteger(value)).toBe(true);
      });
    });

    it('generates different samples for consecutive rounds', () => {
      const round1 = buildReplaySample('baccarat', 1, 12);
      const round2 = buildReplaySample('baccarat', 2, 12);
      const round3 = buildReplaySample('baccarat', 3, 12);

      expect(round1.sample).not.toEqual(round2.sample);
      expect(round2.sample).not.toEqual(round3.sample);
      expect(round1.fingerprint).not.toBe(round2.fingerprint);
    });
  });

  describe('cross-browser determinism', () => {
    it('produces identical results across multiple runs', () => {
      const runs = Array.from({ length: 100 }, () =>
        buildReplayFingerprint('roulette', 42, 32)
      );

      const uniqueFingerprints = new Set(runs);
      expect(uniqueFingerprints.size).toBe(1);
    });

    it('maintains consistency for all supported game types', () => {
      const gameTypes = [
        'roulette',
        'craps',
        'sicbo',
        'blackjack',
        'baccarat',
        'casinowar',
        'hilo',
        'videopoker',
        'threecard',
        'threecardpoker',
        'ultimateholdem',
      ];

      gameTypes.forEach(gameType => {
        const fp1 = buildReplayFingerprint(gameType, 100, 16);
        const fp2 = buildReplayFingerprint(gameType, 100, 16);
        expect(fp1).toBe(fp2);
      });
    });
  });

  describe('replay sequence consistency', () => {
    it('can replay a recorded sequence identically', () => {
      const gameType = 'craps';
      const roundIds = [1, 2, 3, 4, 5];

      const firstRecording = roundIds.map(id => buildReplaySample(gameType, id, 20));
      const secondRecording = roundIds.map(id => buildReplaySample(gameType, id, 20));

      firstRecording.forEach((firstSample, index) => {
        const secondSample = secondRecording[index];
        expect(firstSample.seed).toBe(secondSample.seed);
        expect(firstSample.sample).toEqual(secondSample.sample);
        expect(firstSample.fingerprint).toBe(secondSample.fingerprint);
      });
    });

    it('produces unique fingerprints for a session sequence', () => {
      const sessionLength = 50;
      const fingerprints = Array.from({ length: sessionLength }, (_, i) =>
        buildReplayFingerprint('blackjack', i, 24)
      );

      const uniqueFingerprints = new Set(fingerprints);
      expect(uniqueFingerprints.size).toBe(sessionLength);
    });
  });
});
