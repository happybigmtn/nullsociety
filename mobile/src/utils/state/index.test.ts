import * as stateExports from './index';

describe('state index exports', () => {
  it('exposes parser helpers', () => {
    expect(stateExports.parseBlackjackState).toBeDefined();
    expect(stateExports.parseHiLoState).toBeDefined();
    expect(stateExports.parseBaccaratState).toBeDefined();
    expect(stateExports.parseRouletteState).toBeDefined();
    expect(stateExports.parseCrapsState).toBeDefined();
    expect(stateExports.parseSicBoState).toBeDefined();
    expect(stateExports.parseVideoPokerState).toBeDefined();
    expect(stateExports.parseCasinoWarState).toBeDefined();
    expect(stateExports.parseThreeCardState).toBeDefined();
    expect(stateExports.parseUltimateHoldemState).toBeDefined();
  });
});
