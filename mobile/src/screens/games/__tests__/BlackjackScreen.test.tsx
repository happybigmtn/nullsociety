import React from 'react';
import { InteractionManager, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import {
  mockHaptics,
  mockUseGameConnection,
  pressAll,
  resetGameConnection,
  setGameConnectionMessage,
} from '../../../test-utils/gameScreenTestUtils';
import { PrimaryButton } from '../../../components/ui';
import { parseBlackjackState } from '../../../utils';
import { BlackjackScreen } from '../BlackjackScreen';

jest.mock('../../../utils', () => {
  const actual = jest.requireActual('../../../utils');
  return {
    ...actual,
    parseBlackjackState: jest.fn(),
  };
});

const mockParseBlackjackState = parseBlackjackState as jest.Mock;

const textMatches = (value: unknown, target: string): boolean => {
  if (typeof value === 'string') return value === target;
  if (Array.isArray(value)) return value.some((child) => textMatches(child, target));
  return false;
};

const findPrimaryButton = (tree: ReturnType<typeof create>, label: string) =>
  tree.root.findAllByType(PrimaryButton).find((node) => node.props.label === label);

describe('BlackjackScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetGameConnection();
    mockParseBlackjackState.mockReset();
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb) => {
      cb();
      return { cancel: jest.fn() } as unknown as { cancel: () => void };
    });
  });

  it('renders and handles actions', async () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<BlackjackScreen />);
    });

    await pressAll(tree);
    expect(tree.toJSON()).toBeTruthy();
  });

  it('handles game_result win and push states', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<BlackjackScreen />);
    });

    setGameConnectionMessage({
      type: 'game_result',
      won: true,
      hands: [{ cards: [0, 1], value: 20 }],
      dealer: { cards: [2, 3], value: 18 },
    });

    act(() => {
      tree.update(<BlackjackScreen />);
    });

    expect(mockHaptics.win).toHaveBeenCalled();

    setGameConnectionMessage({
      type: 'game_result',
      push: true,
      hands: [{ cards: [4, 5], value: 19 }],
      dealer: { cards: [6, 7], value: 19 },
    });

    act(() => {
      tree.update(<BlackjackScreen />);
    });

    expect(mockHaptics.push).toHaveBeenCalled();
  });

  it('sends stand action and updates to dealer turn', async () => {
    const sendSpy = mockUseGameConnection().send;
    mockParseBlackjackState.mockReturnValue({
      playerCards: [{ suit: 'hearts', rank: '9' }],
      dealerCards: [{ suit: 'spades', rank: 'K' }, { suit: 'clubs', rank: '5' }],
      playerTotal: 9,
      dealerTotal: 15,
      canDouble: false,
      canSplit: false,
      dealerHidden: true,
      phase: 'player_turn',
    });

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<BlackjackScreen />);
    });

    setGameConnectionMessage({
      type: 'game_started',
      state: [1, 2, 3],
    });

    act(() => {
      tree.update(<BlackjackScreen />);
    });

    const standButton = findPrimaryButton(tree, 'STAND');
    await act(async () => {
      await standButton?.props.onPress?.();
    });

    expect(sendSpy).toHaveBeenCalledWith({ type: 'blackjack_stand' });
    const hasDealerTurn = tree.root
      .findAllByType(Text)
      .some((node) => textMatches(node.props.children, "Dealer's turn"));
    expect(hasDealerTurn).toBe(true);
  });

  it('sends double and split actions when allowed', async () => {
    const sendSpy = mockUseGameConnection().send;
    mockParseBlackjackState.mockReturnValue({
      playerCards: [
        { suit: 'hearts', rank: '8' },
        { suit: 'diamonds', rank: '8' },
      ],
      dealerCards: [{ suit: 'spades', rank: '9' }, { suit: 'clubs', rank: 'A' }],
      playerTotal: 16,
      dealerTotal: 10,
      canDouble: true,
      canSplit: true,
      dealerHidden: true,
      phase: 'player_turn',
    });

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<BlackjackScreen />);
    });

    setGameConnectionMessage({
      type: 'game_started',
      state: [4, 5, 6],
    });

    act(() => {
      tree.update(<BlackjackScreen />);
    });

    const doubleButton = findPrimaryButton(tree, 'DOUBLE');
    await act(async () => {
      await doubleButton?.props.onPress?.();
    });

    expect(sendSpy).toHaveBeenCalledWith({ type: 'blackjack_double' });

    const splitButton = findPrimaryButton(tree, 'SPLIT');
    await act(async () => {
      await splitButton?.props.onPress?.();
    });

    expect(sendSpy).toHaveBeenCalledWith({ type: 'blackjack_split' });
  });
});
