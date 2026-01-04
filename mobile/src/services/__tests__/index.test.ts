import * as services from '../index';

describe('services index', () => {
  it('re-exports service helpers', () => {
    expect(services.initializeNotifications).toBeDefined();
    expect(services.initializeStorage).toBeDefined();
  });
});
