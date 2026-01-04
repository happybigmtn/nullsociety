import * as game from './index';

describe('game components index', () => {
  it('exports game components', () => {
    expect(game.GameLayout).toBeDefined();
    expect(game.GameHeader).toBeDefined();
  });
});
