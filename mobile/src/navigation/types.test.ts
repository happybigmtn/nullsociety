import { GAME_SCREENS } from './types';

describe('navigation types', () => {
  it('exposes game screen names', () => {
    expect(GAME_SCREENS).toBeDefined();
    expect(Object.keys(GAME_SCREENS).length).toBeGreaterThan(0);
  });
});
