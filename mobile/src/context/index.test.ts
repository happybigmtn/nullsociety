import * as context from './index';

describe('context index', () => {
  it('re-exports providers', () => {
    expect(context.AuthProvider).toBeDefined();
    expect(context.WebSocketProvider).toBeDefined();
  });
});
