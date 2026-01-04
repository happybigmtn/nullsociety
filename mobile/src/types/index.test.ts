import { getGameName, GAME_NAMES } from './index';

describe('types helpers', () => {
  it('returns display names for games', () => {
    const first = Object.keys(GAME_NAMES)[0] as keyof typeof GAME_NAMES | undefined;
    if (first) {
      expect(getGameName(first)).toBe(GAME_NAMES[first]);
    }
  });

  it('falls back to id when unknown', () => {
    expect(getGameName('unknown_game' as never)).toBe('unknown_game');
  });
});
