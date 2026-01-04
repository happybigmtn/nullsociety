import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { Card, HiddenCard } from '../Card';

jest.mock('../../../services/haptics', () => ({
  haptics: { cardDeal: jest.fn() },
}));

describe('Card', () => {
  let mockHaptics: { cardDeal: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    mockHaptics = (jest.requireMock('../../../services/haptics') as {
      haptics: { cardDeal: jest.Mock };
    }).haptics;
    mockHaptics.cardDeal.mockClear();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('renders rank and suit when face up', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Card suit="hearts" rank="A" faceUp />);
    });
    const texts = tree.root
      .findAll((node) => node.type === Text)
      .map((node) => node.props.children);
    expect(texts).toContain('A');
    expect(texts).toContain('♥');
    act(() => {
      tree.unmount();
    });
  });

  it('renders hidden card placeholder', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HiddenCard />);
    });
    expect(tree.toJSON()).toBeTruthy();
    act(() => {
      tree.unmount();
    });
  });

  it('triggers flip side effects outside test env', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Card suit="spades" rank="K" faceUp={false} size="large" />);
    });
    act(() => {
      tree.update(<Card suit="spades" rank="K" faceUp size="large" />);
    });

    expect(mockHaptics.cardDeal).toHaveBeenCalled();

    act(() => {
      tree.unmount();
    });
    process.env.NODE_ENV = originalEnv;
  });
});
