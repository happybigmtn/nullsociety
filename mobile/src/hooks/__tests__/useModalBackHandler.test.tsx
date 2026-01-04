import React from 'react';
import { act, create } from 'react-test-renderer';
import { BackHandler } from 'react-native';
import { useModalBackHandler } from '../useModalBackHandler';
import { useFocusEffect } from '@react-navigation/native';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

const mockUseFocusEffect = useFocusEffect as jest.Mock;

function renderHook(hook: () => void) {
  const TestComponent = () => {
    hook();
    return null;
  };
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(<TestComponent />);
  });
  return {
    unmount: () => act(() => renderer.unmount()),
  };
}

describe('useModalBackHandler', () => {
  beforeEach(() => {
    mockUseFocusEffect.mockReset();
  });

  it('does nothing when modal is closed', () => {
    const addEventListenerSpy = jest.spyOn(BackHandler, 'addEventListener');
    mockUseFocusEffect.mockImplementation((effect: () => void) => effect());

    renderHook(() => useModalBackHandler(false, jest.fn()));

    expect(addEventListenerSpy).not.toHaveBeenCalled();
    addEventListenerSpy.mockRestore();
  });

  it('registers back handler and calls onClose when open', () => {
    const remove = jest.fn();
    let capturedHandler: (() => boolean) | null = null;
    const addEventListenerSpy = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        capturedHandler = handler;
        return { remove };
      });
    let cleanup: undefined | (() => void);
    mockUseFocusEffect.mockImplementation((effect: () => void) => {
      cleanup = effect();
    });

    const onClose = jest.fn();
    renderHook(() => useModalBackHandler(true, onClose));

    expect(addEventListenerSpy).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    expect(capturedHandler).not.toBeNull();
    if (capturedHandler) {
      const handled = capturedHandler();
      expect(handled).toBe(true);
    }
    expect(onClose).toHaveBeenCalledTimes(1);

    cleanup?.();
    expect(remove).toHaveBeenCalledTimes(1);
    addEventListenerSpy.mockRestore();
  });
});
