import React from 'react';
import { act, create } from 'react-test-renderer';
import { useKeyboardControls, useGameKeyboard, KEY_ACTIONS } from '../useKeyboardControls';

let windowHandler: ((event: { key: string }) => void) | null = null;

global.window = {
  addEventListener: (_event: string, handler: (event: { key: string }) => void) => {
    windowHandler = handler;
  },
  removeEventListener: () => {
    windowHandler = null;
  },
} as unknown as Window;

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

type HookResult<T> = {
  getResult: () => T;
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
    unmount: () => act(() => renderer.unmount()),
  };
}

describe('useKeyboardControls', () => {
  beforeEach(() => {
    windowHandler = null;
  });

  it('fires registered handlers for key presses', () => {
    const onAction = jest.fn();
    const { getResult, unmount } = renderHook(() => useKeyboardControls({ onAction }));

    const handler = jest.fn();
    act(() => {
      getResult().registerHandler(KEY_ACTIONS.ENTER, handler);
    });

    act(() => {
      windowHandler?.({ key: 'Enter' });
    });

    expect(handler).toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledWith(KEY_ACTIONS.ENTER);
    unmount();
  });

  it('maps multiple keys to actions', () => {
    const onAction = jest.fn();
    const { getResult, unmount } = renderHook(() => useKeyboardControls({ onAction }));
    const handler = jest.fn();

    const cases: Array<[string, keyof typeof KEY_ACTIONS]> = [
      [' ', 'SPACE'],
      ['ArrowUp', 'UP'],
      ['1', 'ONE'],
      ['R', 'R'],
      ['?', 'QUESTION'],
    ];

    cases.forEach(([key, actionKey]) => {
      act(() => {
        getResult().registerHandler(KEY_ACTIONS[actionKey], handler);
      });
      act(() => {
        windowHandler?.({ key });
      });
      expect(onAction).toHaveBeenCalledWith(KEY_ACTIONS[actionKey]);
    });

    expect(handler).toHaveBeenCalled();
    unmount();
  });

  it('skips handling when disabled and unregisters handlers', () => {
    const onAction = jest.fn();
    const { getResult, unmount } = renderHook(() => useKeyboardControls({ onAction, enabled: false }));
    const handler = jest.fn();
    let unsubscribe: (() => void) | null = null;

    act(() => {
      unsubscribe = getResult().registerHandler(KEY_ACTIONS.SPACE, handler);
    });

    act(() => {
      windowHandler?.({ key: ' ' });
    });

    expect(handler).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();

    act(() => {
      unsubscribe?.();
    });

    unmount();
  });

  it('can register game keyboard handlers', () => {
    const handler = jest.fn();
    const nextHandler = jest.fn();
    let currentHandlers = { [KEY_ACTIONS.SPACE]: handler };

    const TestComponent = () => {
      useGameKeyboard(currentHandlers);
      return null;
    };

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(<TestComponent />);
    });

    act(() => {
      windowHandler?.({ key: ' ' });
    });
    expect(handler).toHaveBeenCalled();

    act(() => {
      currentHandlers = { [KEY_ACTIONS.SPACE]: nextHandler };
      renderer.update(<TestComponent />);
    });
    act(() => {
      windowHandler?.({ key: ' ' });
    });
    expect(nextHandler).toHaveBeenCalled();
  });
});
