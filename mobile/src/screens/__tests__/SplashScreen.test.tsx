import React from 'react';
import { act, create } from 'react-test-renderer';
import { SplashScreen } from '../SplashScreen';
import { getPublicKey } from '../../services/crypto';
import { initializeStorage } from '../../services';
import { authenticateWithBiometrics, initializeAuth } from '../../services/auth';

const mockAuthenticate = jest.fn();
const mockInitializeStorage = initializeStorage as jest.Mock;
const mockGetPublicKey = getPublicKey as jest.Mock;
const mockInitializeAuth = initializeAuth as jest.Mock;
const mockAuthenticateWithBiometrics = authenticateWithBiometrics as jest.Mock;

jest.mock('../../context', () => ({
  useAuth: () => ({ authenticate: mockAuthenticate }),
}));

jest.mock('../../services', () => ({
  initializeStorage: jest.fn(),
}));

jest.mock('../../services/crypto', () => ({
  getPublicKey: jest.fn(),
}));

jest.mock('../../services/auth', () => ({
  initializeAuth: jest.fn(),
  authenticateWithBiometrics: jest.fn(),
}));

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('SplashScreen', () => {
  beforeEach(() => {
    mockAuthenticate.mockReset();
    mockInitializeStorage.mockReset();
    mockGetPublicKey.mockReset();
    mockInitializeAuth.mockReset();
    mockAuthenticateWithBiometrics.mockReset();
  });

  it('navigates to lobby when biometrics succeed', async () => {
    mockInitializeStorage.mockResolvedValue(undefined);
    mockGetPublicKey.mockResolvedValue('pubkey');
    mockInitializeAuth.mockResolvedValue({ available: true });
    mockAuthenticateWithBiometrics.mockResolvedValue(true);

    const navigation = { replace: jest.fn() } as const;
    const route = { key: 'Splash', name: 'Splash' } as const;
    create(<SplashScreen navigation={navigation} route={route} />);

    await act(async () => {
      await flushPromises();
    });

    expect(mockInitializeStorage).toHaveBeenCalled();
    expect(mockGetPublicKey).toHaveBeenCalled();
    expect(mockAuthenticateWithBiometrics).toHaveBeenCalled();
    expect(mockAuthenticate).toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith('Lobby');
  });

  it('navigates to auth when biometrics fail or unavailable', async () => {
    mockInitializeStorage.mockResolvedValue(undefined);
    mockGetPublicKey.mockResolvedValue('pubkey');
    mockInitializeAuth.mockResolvedValue({ available: true });
    mockAuthenticateWithBiometrics.mockResolvedValue(false);

    const navigation = { replace: jest.fn() } as const;
    const route = { key: 'Splash', name: 'Splash' } as const;
    create(<SplashScreen navigation={navigation} route={route} />);

    await act(async () => {
      await flushPromises();
    });

    expect(navigation.replace).toHaveBeenCalledWith('Auth');

    mockInitializeAuth.mockResolvedValue({ available: false });
    mockAuthenticateWithBiometrics.mockResolvedValue(true);
    create(<SplashScreen navigation={navigation} route={route} />);
    await act(async () => {
      await flushPromises();
    });
    expect(navigation.replace).toHaveBeenCalledWith('Auth');
  });

  it('falls back to auth on initialization error', async () => {
    mockInitializeStorage.mockRejectedValue(new Error('fail'));
    const navigation = { replace: jest.fn() } as const;
    const route = { key: 'Splash', name: 'Splash' } as const;
    create(<SplashScreen navigation={navigation} route={route} />);

    await act(async () => {
      await flushPromises();
    });

    expect(navigation.replace).toHaveBeenCalledWith('Auth');
  });
});
