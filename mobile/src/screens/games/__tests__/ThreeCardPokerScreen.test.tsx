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
import { parseThreeCardState } from '../../../utils';
import { ThreeCardPokerScreen } from '../ThreeCardPokerScreen';

jest.mock('../../../utils', () => {
  const actual = jest.requireActual('../../../utils');
  return {
    ...actual,
    parseThreeCardState: jest.fn(),
  };
});

const mockParseThreeCardState = parseThreeCardState as jest.Mock;

const textMatches = (value: unknown, target: string): boolean => {
  if (typeof value === 'string') return value === target;
  if (Array.isArray(value)) return value.some((child) => textMatches(child, target));
  return false;
};

const findPrimaryButton = (tree: ReturnType<typeof create>, label: string) =>
  tree.root.findAllByType(PrimaryButton).find((node) => node.props.label === label);

describe('ThreeCardPokerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetGameConnection();
    mockParseThreeCardState.mockReset();
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb) => {
      cb();
      return { cancel: jest.fn() } as unknown as { cancel: () => void };
    });
  });

  it('renders and handles actions', async () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<ThreeCardPokerScreen />);
    });

    await pressAll(tree);
    expect(tree.toJSON()).toBeTruthy();
  });

  it('handles game_result jackpot', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<ThreeCardPokerScreen />);
    });

    setGameConnectionMessage({
      type: 'game_result',
      payout: 250,
      player: { cards: [0, 1, 2], rank: 'STRAIGHT_FLUSH' },
      dealer: { cards: [3, 4, 5], rank: 'PAIR' },
      anteReturn: 100,
      anteBet: 25,
    });

    act(() => {
      tree.update(<ThreeCardPokerScreen />);
    });

    expect(mockHaptics.jackpot).toHaveBeenCalled();
  });

  it('handles game_move to dealt and allows fold', async () => {
    const sendSpy = mockUseGameConnection().send;
    mockParseThreeCardState.mockReturnValue({
      playerCards: [
        { suit: 'hearts', rank: 'A' },
        { suit: 'spades', rank: 'K' },
        { suit: 'clubs', rank: 'Q' },
      ],
      dealerCards: [
        { suit: 'diamonds', rank: '2' },
        { suit: 'clubs', rank: '5' },
        { suit: 'hearts', rank: '7' },
      ],
      pairPlusBet: 0,
      sixCardBonusBet: 0,
      progressiveBet: 0,
      stage: 'decision',
    });

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<ThreeCardPokerScreen />);
    });

    setGameConnectionMessage({
      type: 'game_move',
      state: [1, 2, 3],
    });

    act(() => {
      tree.update(<ThreeCardPokerScreen />);
    });

    const playButton = findPrimaryButton(tree, 'PLAY ($0)');
    expect(playButton).toBeTruthy();

    const foldButton = findPrimaryButton(tree, 'FOLD');
    await act(async () => {
      await foldButton?.props.onPress?.();
    });

    expect(sendSpy).toHaveBeenCalledWith({ type: 'three_card_poker_fold' });
    const hasFolded = tree.root
      .findAllByType(Text)
      .some((node) => textMatches(node.props.children, 'Folded'));
    expect(hasFolded).toBe(true);
  });

  it('handles game_result loss path', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<ThreeCardPokerScreen />);
    });

    setGameConnectionMessage({
      type: 'game_result',
      payout: 0,
      player: { cards: [0, 1, 2], rank: 'HIGH_CARD' },
      dealer: { cards: [3, 4, 5], rank: 'PAIR', qualifies: true },
      anteBet: 25,
      anteReturn: 0,
    });

    act(() => {
      tree.update(<ThreeCardPokerScreen />);
    });

    expect(mockHaptics.loss).toHaveBeenCalled();
  });
});
