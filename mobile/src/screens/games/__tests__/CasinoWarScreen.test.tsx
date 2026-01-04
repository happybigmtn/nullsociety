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
import { parseCasinoWarState } from '../../../utils';
import { CasinoWarScreen } from '../CasinoWarScreen';

jest.mock('../../../utils', () => {
  const actual = jest.requireActual('../../../utils');
  return {
    ...actual,
    parseCasinoWarState: jest.fn(),
  };
});

const mockParseCasinoWarState = parseCasinoWarState as jest.Mock;

const textMatches = (value: unknown, target: string): boolean => {
  if (typeof value === 'string') return value === target;
  if (Array.isArray(value)) return value.some((child) => textMatches(child, target));
  return false;
};

const findPrimaryButton = (tree: ReturnType<typeof create>, label: string) =>
  tree.root.findAllByType(PrimaryButton).find((node) => node.props.label === label);

describe('CasinoWarScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetGameConnection();
    mockParseCasinoWarState.mockReset();
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
      tree = create(<CasinoWarScreen />);
    });

    await pressAll(tree);
    expect(tree.toJSON()).toBeTruthy();
  });

  it('handles game_result with win', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<CasinoWarScreen />);
    });

    setGameConnectionMessage({
      type: 'game_result',
      won: true,
      playerCard: 12,
      dealerCard: 4,
    });

    act(() => {
      tree.update(<CasinoWarScreen />);
    });

    expect(mockHaptics.win).toHaveBeenCalled();
  });

  it('toggles tie bet and sends a deal', async () => {
    const sendSpy = mockUseGameConnection().send;
    mockUseChipBetting.mockImplementation(() => ({
      bet: 25,
      selectedChip: 25,
      balance: 1000,
      setSelectedChip: jest.fn(),
      placeChip: jest.fn(),
      clearBet: jest.fn(),
      setBet: jest.fn(),
    }));

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<CasinoWarScreen />);
    });

    const tieBetButton = findPrimaryButton(tree, 'Add Tie Bet');
    await act(async () => {
      await tieBetButton?.props.onPress?.();
    });

    expect(mockHaptics.buttonPress).toHaveBeenCalled();
    expect(findPrimaryButton(tree, 'Tie Bet $25')).toBeTruthy();

    const dealButton = findPrimaryButton(tree, 'DEAL');
    await act(async () => {
      await dealButton?.props.onPress?.();
    });

    expect(mockHaptics.betConfirm).toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'casino_war_deal',
      amount: 25,
      tieBet: 25,
    });
  });

  it('enters war choice and allows surrender', async () => {
    const sendSpy = mockUseGameConnection().send;
    mockParseCasinoWarState.mockReturnValue({
      playerCard: { suit: 'hearts', rank: 'A' },
      dealerCard: { suit: 'spades', rank: 'A' },
      stage: 'war',
      tieBet: 10,
    });

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<CasinoWarScreen />);
    });

    setGameConnectionMessage({
      type: 'game_move',
      state: [1, 2, 3],
    });

    act(() => {
      tree.update(<CasinoWarScreen />);
    });

    const hasWarPrompt = tree.root
      .findAllByType(Text)
      .some((node) => textMatches(node.props.children, 'Tie! Go to War or Surrender?'));
    expect(hasWarPrompt).toBe(true);

    const surrenderButton = findPrimaryButton(tree, 'SURRENDER');
    await act(async () => {
      await surrenderButton?.props.onPress?.();
    });

    expect(sendSpy).toHaveBeenCalledWith({ type: 'casino_war_surrender' });
    const hasSurrenderMessage = tree.root
      .findAllByType(Text)
      .some((node) => textMatches(node.props.children, 'Surrendered - Half bet returned'));
    expect(hasSurrenderMessage).toBe(true);
  });

  it('handles game_result loss path', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<CasinoWarScreen />);
    });

    setGameConnectionMessage({
      type: 'game_result',
      won: false,
      playerCard: 2,
      dealerCard: 10,
    });

    act(() => {
      tree.update(<CasinoWarScreen />);
    });

    expect(mockHaptics.loss).toHaveBeenCalled();
  });
});
