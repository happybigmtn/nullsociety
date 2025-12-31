import { getWebSocketUrl } from '../services/websocket';

export function getNetworkLabel(): string {
  const url = getWebSocketUrl().toLowerCase();
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return 'Localnet';
  }
  return 'Testnet';
}

