// Simple test runner for chartHelpers
import { transformSupplyData, transformIssuanceData } from './chartHelpers.js';
import assert from 'assert';

console.log('Running Chart Helper Tests...');

// Test Data
const mockData = [
  { timestamp: 1000, total_burned: 100, total_issuance: 50 },
  { timestamp: 2000, total_burned: 200, total_issuance: 150 },
];

// Test Supply Transformation
const supply = transformSupplyData(mockData);
assert.strictEqual(supply[0].circulating, 1_000_000_000 + 50 - 100, 'Supply calc 1 failed');
assert.strictEqual(supply[1].circulating, 1_000_000_000 + 150 - 200, 'Supply calc 2 failed');
console.log('✅ Supply Data Transformation Passed');

// Test Issuance Transformation
const issuance = transformIssuanceData(mockData);
// issuance strips first element
assert.strictEqual(issuance.length, 1, 'Issuance length failed');

const point = issuance[0];
const dt = 1000; // 2000 - 1000
const mintRate = (150 - 50) / dt; // 0.1
const burnRate = -(200 - 100) / dt; // -0.1
const netRate = ((150 - 50) - (200 - 100)) / dt; // 0

assert.strictEqual(point.rate_mint, mintRate, 'Mint Rate failed');
assert.strictEqual(point.rate_burn, burnRate, 'Burn Rate failed');
assert.strictEqual(point.net_rate, netRate, 'Net Rate failed');
console.log('✅ Issuance Data Transformation Passed');
