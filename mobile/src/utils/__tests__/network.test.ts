import { getNetworkLabel } from '../network';
import { getWebSocketUrl } from '../../services/websocket';

jest.mock('../../services/websocket', () => ({
  getWebSocketUrl: jest.fn(),
}));

const mockGetWebSocketUrl = getWebSocketUrl as jest.Mock;

describe('network utils', () => {
  it('labels localhost as Localnet', () => {
    mockGetWebSocketUrl.mockReturnValue('ws://localhost:9010');
    expect(getNetworkLabel()).toBe('Localnet');

    mockGetWebSocketUrl.mockReturnValue('ws://127.0.0.1:9010');
    expect(getNetworkLabel()).toBe('Localnet');
  });

  it('labels non-localhost URLs as Testnet', () => {
    mockGetWebSocketUrl.mockReturnValue('wss://api.nullspace.casino/ws');
    expect(getNetworkLabel()).toBe('Testnet');
  });
});
