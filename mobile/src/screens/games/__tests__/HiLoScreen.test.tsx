import React from 'react';
import { InteractionManager, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import {
  mockHaptics,
  mockUseChipBetting,
  mockUseGameConnection,
  pressAll,
  resetGameConnection,
  setGameConnectionMessage,
} from '../../../test-utils/gameScreenTestUtils';
import { PrimaryButton } from '../../../components/ui';
import { parseHiLoState } from '../../../utils';
import { HiLoScreen } from '../HiLoScreen';

jest.mock('../../../utils', () => {
  const actual = jest.requireActual('../../../utils');
  return {
    ...actual,
    parseHiLoState: jest.fn(),
  };
});

const mockParseHiLoState = parseHiLoState as jest.Mock;

const textMatches = (value: unknown, target: string): boolean => {
  if (typeof value === 'string') return value === target;
  if (Array.isArray(value)) return value.some((child) => textMatches(child, target));
  return false;
};

const findPrimaryButton = (tree: ReturnType<typeof create>, label: string) =>
  tree.root.findAllByType(PrimaryButton).find((node) => node.props.label === label);

describe('HiLoScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetGameConnection();
    mockParseHiLoState.mockReset();
    mockUseChipBetting.mockReset();
    mockUseChipBetting.mockImplementation(() => ({
      bet: 0,
      selectedChip: 25,
      balance: 1000,
      setSelectedChip: jest.fn(),
      placeChip: jest.fn(() => true),
      clearBet: jest.fn(),
      setBet: jest.fn(),
    }));
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb) => {
      cb();
      return { cancel: jest.fn() } as unknown as { cancel: () => void };
    });
  });

  it('renders and handles actions', async () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<HiLoScreen />);
    });

    await pressAll(tree);
    expect(tree.toJSON()).toBeTruthy();
  });

  it('handles game_result loss state', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<HiLoScreen />);
    });

    setGameConnectionMessage({
      type: 'game_result',
      won: false,
      previousCard: 10,
      nextCard: 5,
    });

    act(() => {
      tree.update(<HiLoScreen />);
    });

    expect(mockHaptics.loss).toHaveBeenCalled();
  });

  it('handles game_started and shows call prompt', () => {
    mockParseHiLoState.mockReturnValue({
      currentCard: { suit: 'hearts', rank: '9' },
    });

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<HiLoScreen />);
    });

    setGameConnectionMessage({
      type: 'game_started',
      state: [1, 2, 3],
    });

    act(() => {
      tree.update(<HiLoScreen />);
    });

    const hasPrompt = tree.root
      .findAllByType(Text)
      .some((node) => textMatches(node.props.children, 'Make your call'));
    expect(hasPrompt).toBe(true);
  });

  it('sends higher bet when bet is placed', async () => {
    const sendSpy = mockUseGameConnection().send;
    mockUseChipBetting.mockImplementation(() => ({
      bet: 25,
      selectedChip: 25,
      balance: 1000,
      setSelectedChip: jest.fn(),
      placeChip: jest.fn(() => true),
      clearBet: jest.fn(),
      setBet: jest.fn(),
    }));

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<HiLoScreen />);
    });

    const higherButton = findPrimaryButton(tree, 'HIGHER');
    await act(async () => {
      await higherButton?.props.onPress?.();
    });

    expect(mockHaptics.betConfirm).toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'hilo_bet',
      amount: 25,
      choice: 'higher',
    });
  });
});
