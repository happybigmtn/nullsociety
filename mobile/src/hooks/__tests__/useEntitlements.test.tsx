import React from 'react';
import { act, create } from 'react-test-renderer';
import { useEntitlements } from '../useEntitlements';
import { useGameStore } from '../../stores/gameStore';
import { fetchMobileEntitlements } from '../../services/entitlements';

jest.mock('../../stores/gameStore', () => ({
  useGameStore: jest.fn(),
}));

jest.mock('../../services/entitlements', () => ({
  fetchMobileEntitlements: jest.fn(),
}));

type HookResult<T> = {
  getResult: () => T;
  rerender: () => void;
  unmount: () => void;
};

function renderHook<T>(hook: () => T): HookResult<T> {
  let result!: T;
  const TestComponent = () => {
    result = hook();
    return null;
  };

  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(<TestComponent />);
  });

  return {
    getResult: () => result,
    rerender: () => act(() => renderer.update(<TestComponent />)),
    unmount: () => act(() => renderer.unmount()),
  };
}

const mockUseGameStore = useGameStore as jest.Mock;
const mockFetch = fetchMobileEntitlements as jest.Mock;

const flushPromises = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  mockUseGameStore.mockImplementation((selector: (state: { publicKey: string | null }) => string | null) =>
    selector({ publicKey: 'player-1' })
  );
  mockFetch.mockReset();
});

describe('useEntitlements', () => {
  it('skips fetch when public key is missing', async () => {
    mockUseGameStore.mockImplementation((selector: (state: { publicKey: string | null }) => string | null) =>
      selector({ publicKey: null })
    );

    const { getResult, unmount } = renderHook(() => useEntitlements());

    await act(async () => {
      await flushPromises();
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(getResult().entitlements).toEqual([]);
    expect(getResult().loading).toBe(false);
    expect(getResult().error).toBeNull();
    unmount();
  });

  it('loads entitlements for the active public key', async () => {
    const entitlements = [{ tier: 'vip', status: 'active', source: 'test', startsAtMs: 1 }];
    mockFetch.mockResolvedValue(entitlements);

    const { getResult, unmount } = renderHook(() => useEntitlements());

    await act(async () => {
      await flushPromises();
      await flushPromises();
    });

    expect(mockFetch).toHaveBeenCalledWith('player-1');
    expect(getResult().entitlements).toEqual(entitlements);
    expect(getResult().loading).toBe(false);
    expect(getResult().error).toBeNull();

    await act(async () => {
      await getResult().refresh();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('captures errors from entitlement fetches', async () => {
    mockFetch.mockRejectedValue(new Error('nope'));

    const { getResult, unmount } = renderHook(() => useEntitlements());

    await act(async () => {
      await flushPromises();
      await flushPromises();
    });

    expect(getResult().entitlements).toEqual([]);
    expect(getResult().loading).toBe(false);
    expect(getResult().error).toBe('nope');
    unmount();
  });
});
