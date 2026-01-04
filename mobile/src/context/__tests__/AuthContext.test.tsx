import React from 'react';
import { act, create } from 'react-test-renderer';

const mockStorage = {
  initializeStorage: jest.fn(async () => undefined),
  getBoolean: jest.fn(() => false),
  setBoolean: jest.fn(),
  deleteKey: jest.fn(),
  STORAGE_KEYS: { SESSION_ACTIVE: 'auth.session_active' },
};

jest.mock('../../services/storage', () => mockStorage);

const { AuthProvider, useAuth } = require('../AuthContext');

const flushPromises = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('AuthContext', () => {
  beforeEach(() => {
    mockStorage.getBoolean.mockReset();
    mockStorage.setBoolean.mockReset();
    mockStorage.deleteKey.mockReset();
  });

  it('hydrates auth state and allows login/logout', async () => {
    mockStorage.getBoolean.mockReturnValueOnce(true);

    let ctx: ReturnType<typeof useAuth> | null = null;
    const Consumer = () => {
      ctx = useAuth();
      return null;
    };

    await act(async () => {
      create(
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      );
      await flushPromises();
    });

    await act(async () => {
      await flushPromises();
    });

    expect(mockStorage.initializeStorage).toHaveBeenCalled();
    expect(mockStorage.getBoolean).toHaveBeenCalledWith(
      mockStorage.STORAGE_KEYS.SESSION_ACTIVE,
      false
    );
    expect(ctx?.isLoading).toBe(false);

    act(() => {
      ctx?.logout();
    });

    expect(ctx?.isAuthenticated).toBe(false);

    act(() => {
      ctx?.authenticate();
    });

    expect(ctx?.isAuthenticated).toBe(true);
  });
});
