import * as games from './index';

describe('games index', () => {
  it('exports game screens', () => {
    expect(games.HiLoScreen).toBeDefined();
    expect(games.BlackjackScreen).toBeDefined();
  });
});
