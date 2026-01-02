import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { Card, HiddenCard } from '../Card';

describe('Card', () => {
  beforeEach(() => {
    jest.useFakeTimers();
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
});
