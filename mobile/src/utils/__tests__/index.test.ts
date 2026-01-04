import * as utils from '../index';

describe('utils index', () => {
  it('re-exports common helpers', () => {
    expect(utils.getDiceTotal).toBeDefined();
    expect(utils.decodeCardId).toBeDefined();
    expect(utils.parseNumeric).toBeDefined();
    expect(utils.getNetworkLabel).toBeDefined();
    expect(utils.decodeStateBytes).toBeDefined();
  });
});
