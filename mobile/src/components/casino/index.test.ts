import * as casino from './index';

describe('casino components index', () => {
  it('exports casino components', () => {
    expect(casino.Card).toBeDefined();
    expect(casino.ChipSelector).toBeDefined();
  });
});
