import * as ui from './index';

describe('ui index', () => {
  it('exports ui components', () => {
    expect(ui.PrimaryButton).toBeDefined();
    expect(ui.HelpButton).toBeDefined();
    expect(ui.WalletBadge).toBeDefined();
  });
});
