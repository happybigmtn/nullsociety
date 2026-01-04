import * as hooks from './index';

describe('hooks index', () => {
  it('re-exports hooks', () => {
    expect(hooks.useChipBetting).toBeDefined();
    expect(hooks.useGameConnection).toBeDefined();
    expect(hooks.useGatewaySession).toBeDefined();
  });
});
