import * as screens from './index';

describe('screens index', () => {
  it('exports screens', () => {
    expect(screens.SplashScreen).toBeDefined();
    expect(screens.AuthScreen).toBeDefined();
  });
});
