import { describe, expect, it } from 'vitest';
import { transformSupplyData, transformIssuanceData } from '../chartHelpers.js';

// Test Data
const mockData = [
  { timestamp: 1000, total_burned: 100, total_issuance: 50 },
  { timestamp: 2000, total_burned: 200, total_issuance: 150 },
];

describe('chartHelpers', () => {
  it('transforms supply data with circulating totals', () => {
    const supply = transformSupplyData(mockData);
    expect(supply[0].circulating).toBe(1_000_000_000 + 50 - 100);
    expect(supply[1].circulating).toBe(1_000_000_000 + 150 - 200);
  });

  it('transforms issuance data with rate calculations', () => {
    const issuance = transformIssuanceData(mockData);
    expect(issuance).toHaveLength(1);

    const point = issuance[0];
    const dt = 1000; // 2000 - 1000
    const mintRate = (150 - 50) / dt; // 0.1
    const burnRate = -(200 - 100) / dt; // -0.1
    const netRate = ((150 - 50) - (200 - 100)) / dt; // 0

    expect(point.rate_mint).toBe(mintRate);
    expect(point.rate_burn).toBe(burnRate);
    expect(point.net_rate).toBe(netRate);
  });
});
