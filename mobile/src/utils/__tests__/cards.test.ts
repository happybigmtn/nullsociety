import { decodeCardId, decodeCardList, isHiddenCard } from '../cards';

describe('cards utils', () => {
  it('decodes valid card ids', () => {
    expect(decodeCardId(0)).toEqual({ suit: 'spades', rank: 'A' });
    expect(decodeCardId(12)).toEqual({ suit: 'spades', rank: 'K' });
    expect(decodeCardId(13)).toEqual({ suit: 'hearts', rank: 'A' });
    expect(decodeCardId(51)).toEqual({ suit: 'clubs', rank: 'K' });
  });

  it('rejects invalid card ids', () => {
    expect(decodeCardId(-1)).toBeNull();
    expect(decodeCardId(52)).toBeNull();
    expect(decodeCardId(1.5)).toBeNull();
    expect(decodeCardId(Number.NaN)).toBeNull();
  });

  it('decodes card lists and skips invalid values', () => {
    const cards = decodeCardList([0, 52, 13, 51]);
    expect(cards).toEqual([
      { suit: 'spades', rank: 'A' },
      { suit: 'hearts', rank: 'A' },
      { suit: 'clubs', rank: 'K' },
    ]);

    const typed = decodeCardList(new Uint8Array([10, 255]));
    expect(typed).toEqual([{ suit: 'spades', rank: 'J' }]);
  });

  it('detects hidden cards', () => {
    expect(isHiddenCard(0xff)).toBe(true);
    expect(isHiddenCard(1)).toBe(false);
  });
});
