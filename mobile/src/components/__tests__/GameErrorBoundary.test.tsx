import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { GameErrorBoundary } from '../GameErrorBoundary';

const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

const Broken = () => {
  throw new Error('boom');
};

describe('GameErrorBoundary', () => {
  beforeEach(() => {
    mockGoBack.mockReset();
  });

  it('renders children when no error', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <GameErrorBoundary>
          <Text>OK</Text>
        </GameErrorBoundary>
      );
    });

    const text = tree.root.findAllByType(Text).map((node) => node.props.children).join(' ');
    expect(text).toContain('OK');
  });

  it('shows fallback UI when child throws', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <GameErrorBoundary>
          <Broken />
        </GameErrorBoundary>
      );
    });

    const text = tree.root.findAllByType(Text).map((node) => node.props.children).join(' ');
    expect(text).toContain('Something went wrong');
    const buttons = tree.root.findAll((node) => typeof node.props.onPress === 'function');
    const backButton = buttons.find((node) =>
      node.findAllByType(Text).some((textNode) => textNode.props.children === 'Back to Lobby')
    );
    act(() => {
      backButton?.props.onPress();
    });
    expect(mockGoBack).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
