import * as stores from './index';

describe('stores index', () => {
  it('re-exports game store', () => {
    expect(stores.useGameStore).toBeDefined();
  });
});
