import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { GameHeader } from '../GameHeader';

const mockGoBack = jest.fn();
const mockHelpButton = jest.fn(({ onPress }: { onPress: () => void }) => (
  <Text onPress={onPress}>Help</Text>
));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock('../../ui/HelpButton', () => ({
  HelpButton: (props: { onPress: () => void }) => mockHelpButton(props),
}));

jest.mock('../EventBadge', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { EventBadge: () => React.createElement(Text, null, 'Event') };
});

jest.mock('../../ui/WalletBadge', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { WalletBadge: () => React.createElement(Text, null, 'Wallet') };
});

describe('GameHeader', () => {
  beforeEach(() => {
    mockGoBack.mockReset();
    mockHelpButton.mockClear();
  });

  it('renders balance and session delta formatting', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<GameHeader title="Blackjack" balance={1200} sessionDelta={0} />);
    });
    let text = tree.root.findAllByType(Text).map((node) => node.props.children).join(' ');
    let normalized = text.replace(/,/g, '');
    expect(normalized).toContain('Balance');
    expect(normalized).toContain('$1200');
    expect(normalized).toContain('Session $0');

    act(() => {
      tree.update(<GameHeader title="Blackjack" balance={1200} sessionDelta={150} />);
    });
    text = tree.root.findAllByType(Text).map((node) => node.props.children).join(' ');
    normalized = text.replace(/,/g, '');
    expect(normalized).toContain('Session +$150');

    act(() => {
      tree.update(<GameHeader title="Blackjack" balance={1200} sessionDelta={-50} />);
    });
    text = tree.root.findAllByType(Text).map((node) => node.props.children).join(' ');
    normalized = text.replace(/,/g, '');
    expect(normalized).toContain('Session $50');
  });

  it('handles back and help actions', () => {
    const onHelp = jest.fn();
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<GameHeader title="Blackjack" balance={1200} onHelp={onHelp} />);
    });

    const pressables = tree.root.findAll((node) => typeof node.props.onPress === 'function');
    const backButton = pressables.find((node) =>
      node.findAllByType(Text).some((textNode) => textNode.props.children === '<')
    );
    act(() => {
      backButton?.props.onPress();
    });
    expect(mockGoBack).toHaveBeenCalled();

    const helpText = tree.root.findAllByType(Text).find((node) => node.props.children === 'Help');
    act(() => {
      helpText?.props.onPress();
    });
    expect(onHelp).toHaveBeenCalled();
  });
});
