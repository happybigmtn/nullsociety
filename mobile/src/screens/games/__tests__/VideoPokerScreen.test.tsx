import React from 'react';
import { InteractionManager } from 'react-native';
import { act, create } from 'react-test-renderer';
import {
  mockHaptics,
  mockUseChipBetting,
  mockUseGameConnection,
  pressAll,
  resetGameConnection,
  setGameConnectionMessage,
} from '../../../test-utils/gameScreenTestUtils';
import { parseVideoPokerState } from '../../../utils';
import { PrimaryButton } from '../../../components/ui';
import { VideoPokerScreen } from '../VideoPokerScreen';

jest.mock('../../../utils', () => {
  const actual = jest.requireActual('../../../utils');
  return {
    ...actual,
    parseVideoPokerState: jest.fn(),
  };
});

const mockParseVideoPokerState = parseVideoPokerState as jest.Mock;

const findPrimaryButton = (tree: ReturnType<typeof create>, label: string) =>
  tree.root.findAllByType(PrimaryButton).find((node) => node.props.label === label);

describe('VideoPokerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetGameConnection();
    mockParseVideoPokerState.mockReset();
    mockUseChipBetting.mockClear();
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb) => {
      cb();
      return { cancel: jest.fn() } as unknown as { cancel: () => void };
    });
  });

  it('renders and handles actions', async () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<VideoPokerScreen />);
    });

    await pressAll(tree);
    expect(tree.toJSON()).toBeTruthy();
  });

  it('handles game_result jackpot', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<VideoPokerScreen />);
    });

    setGameConnectionMessage({
      type: 'game_result',
      payout: 500,
      hand: 'ROYAL_FLUSH',
    });

    act(() => {
      tree.update(<VideoPokerScreen />);
    });

    expect(mockHaptics.jackpot).toHaveBeenCalled();
  });

  it('deals a hand when a bet is placed', async () => {
    const sendSpy = mockUseGameConnection.mock.results[0]?.value?.send ?? mockUseGameConnection().send;
    mockUseChipBetting.mockReturnValue({
      bet: 25,
      selectedChip: 25,
      setSelectedChip: jest.fn(),
      placeChip: jest.fn(() => true),
      clearBet: jest.fn(),
      setBet: jest.fn(),
      balance: 1000,
    });

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<VideoPokerScreen />);
    });

    await pressAll(tree);

    expect(sendSpy).toHaveBeenCalledWith({
      type: 'video_poker_deal',
      amount: 25,
    });
  });

  it('toggles holds and draws in the initial phase', async () => {
    const sendSpy = mockUseGameConnection.mock.results[0]?.value?.send ?? mockUseGameConnection().send;
    const clearBet = jest.fn();
    mockUseChipBetting.mockReturnValue({
      bet: 25,
      selectedChip: 25,
      setSelectedChip: jest.fn(),
      placeChip: jest.fn(() => true),
      clearBet,
      setBet: jest.fn(),
      balance: 1000,
    });

    mockParseVideoPokerState.mockReturnValue({
      cards: [
        { suit: 'hearts', rank: 'A' },
        { suit: 'spades', rank: 'K' },
        { suit: 'diamonds', rank: 'Q' },
        { suit: 'clubs', rank: 'J' },
        { suit: 'hearts', rank: '10' },
      ],
      stage: 'draw',
    });

    setGameConnectionMessage({
      type: 'game_started',
      state: [1, 2, 3],
    });

    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<VideoPokerScreen />);
    });
    await act(async () => {});
    expect(mockParseVideoPokerState).toHaveBeenCalled();

    const drawButton = findPrimaryButton(tree, 'DRAW');
    expect(drawButton).toBeDefined();
    await act(async () => {
      await drawButton?.props.onPress?.();
    });

    expect(sendSpy).toHaveBeenCalledWith({
      type: 'video_poker_draw',
      held: expect.any(Array),
    });

    setGameConnectionMessage({
      type: 'game_result',
      payout: 0,
      hand: 'NOTHING',
    });

    act(() => {
      tree.update(<VideoPokerScreen />);
    });

    await pressAll(tree);
    expect(clearBet).toHaveBeenCalled();
  });
});
