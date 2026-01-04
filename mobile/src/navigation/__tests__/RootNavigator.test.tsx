import React from 'react';
import { act, create } from 'react-test-renderer';
import { RootNavigator } from '../RootNavigator';

let capturedLinking: any = null;
const mockGetStateFromPath = jest.fn();

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children, linking }: { children: React.ReactNode; linking?: unknown }) => {
    capturedLinking = linking;
    return <>{children}</>;
  },
  getStateFromPath: (...args: unknown[]) => mockGetStateFromPath(...args),
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Screen: () => null,
  }),
}));

jest.mock('../../context', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = require('../../context').useAuth as jest.Mock;

describe('RootNavigator', () => {
  beforeEach(() => {
    capturedLinking = null;
    mockGetStateFromPath.mockReset();
  });

  it('renders nothing while loading', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });

    let tree: unknown;
    act(() => {
      tree = create(<RootNavigator />).toJSON();
    });

    expect(tree).toBeNull();
  });

  it('redirects protected routes for unauthenticated users', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    mockGetStateFromPath.mockReturnValue({ routes: [{ name: 'Lobby' }] });

    act(() => {
      create(<RootNavigator />);
    });

    const state = capturedLinking.getStateFromPath('lobby', {});
    expect(state).toEqual({ routes: [{ name: 'Auth' }] });
  });
});
