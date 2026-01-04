import React from 'react';
import { InteractionManager, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import {
  mockHaptics,
  mockUseGameConnection,
  resetGameConnection,
  setGameConnectionMessage,
} from '../../../test-utils/gameScreenTestUtils';
import { PrimaryButton } from '../../../components/ui';
import { parseUltimateHoldemState } from '../../../utils';
import { UltimateTXHoldemScreen } from '../UltimateTXHoldemScreen';

jest.mock('../../../utils', () => {
  const actual = jest.requireActual('../../../utils');
  return {
    ...actual,
    parseUltimateHoldemState: jest.fn(),
  };
});

const mockParseUltimateHoldemState = parseUltimateHoldemState as jest.Mock;

const textMatches = (value: unknown, target: string): boolean => {
  if (typeof value === 'string') return value === target;
  if (Array.isArray(value)) return value.some((child) => textMatches(child, target));
  return false;
};

const findPrimaryButton = (tree: ReturnType<typeof create>, label: string) =>
  tree.root.findAllByType(PrimaryButton).find((node) => node.props.label === label);

const findChipSelector = (tree: ReturnType<typeof create>) =>
  tree.root.find(
    (node) =>
      typeof node.props?.onChipPlace === 'function' &&
      typeof node.props?.onSelect === 'function'
  );

describe('UltimateTXHoldemScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetGameConnection();
    mockParseUltimateHoldemState.mockReset();
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb) => {
      cb();
      return { cancel: jest.fn() } as unknown as { cancel: () => void };
    });
  });

  it('renders and handles actions', async () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<UltimateTXHoldemScreen />);
    });

    const dealButton = findPrimaryButton(tree, 'DEAL');
    await act(async () => {
      await dealButton?.props.onPress?.();
    });
    expect(tree.toJSON()).toBeTruthy();
  });

  it('handles game_result win and loss paths', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<UltimateTXHoldemScreen />);
    });

    setGameConnectionMessage({
      type: 'game_result',
      payout: 300,
      player: { cards: [0, 1], rank: 'ROYAL_FLUSH' },
      dealer: { cards: [2, 3], rank: 'PAIR', qualifies: true },
      community: [4, 5, 6, 7, 8],
      anteReturn: 100,
      anteBet: 25,
    });

    act(() => {
      tree.update(<UltimateTXHoldemScreen />);
    });

    expect(mockHaptics.jackpot).toHaveBeenCalled();

    setGameConnectionMessage({
      type: 'game_result',
      payout: 0,
      player: { cards: [9, 10], rank: 'NOTHING' },
      dealer: { cards: [11, 12], rank: 'PAIR', qualifies: true },
      community: [13, 14, 15, 16, 17],
    });

    act(() => {
      tree.update(<UltimateTXHoldemScreen />);
    });

    expect(mockHaptics.loss).toHaveBeenCalled();
  });

  it('places bets across side pots and sends a deal', async () => {
    const sendSpy = mockUseGameConnection.mock.results[0]?.value?.send ?? mockUseGameConnection().send;
    mockParseUltimateHoldemState.mockReturnValue({
      playerCards: [],
      communityCards: [],
      dealerCards: [],
      stage: 'betting',
      tripsBet: 5,
      sixCardBonusBet: 5,
      progressiveBet: 1,
    });
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<UltimateTXHoldemScreen />);
    });

    const placeChip = (value: number) => {
      const selector = findChipSelector(tree);
      act(() => {
        selector.props.onChipPlace(value);
      });
    };

    placeChip(25);

    setGameConnectionMessage({
      type: 'game_started',
      state: [1, 2, 3],
    });

    act(() => {
      tree.update(<UltimateTXHoldemScreen />);
    });

    expect(tree.root.findAllByType(Text).some((node) => textMatches(node.props.children, 'Trips'))).toBe(true);
    expect(tree.root.findAllByType(Text).some((node) => textMatches(node.props.children, '6-Card'))).toBe(true);
    expect(tree.root.findAllByType(Text).some((node) => textMatches(node.props.children, 'Prog'))).toBe(true);

    const dealButton = findPrimaryButton(tree, 'DEAL');
    await act(async () => {
      await dealButton?.props.onPress?.();
    });

    expect(sendSpy).toHaveBeenCalledWith({
      type: 'ultimate_tx_deal',
      ante: 25,
      blind: 25,
      trips: 5,
      sixCard: 5,
      progressive: 1,
    });
  });

  it('handles check and fold actions from different phases', async () => {
    const sendSpy = mockUseGameConnection.mock.results[0]?.value?.send ?? mockUseGameConnection().send;
    mockParseUltimateHoldemState
      .mockImplementationOnce(() => ({
        playerCards: [],
        communityCards: [],
        dealerCards: [],
        stage: 'preflop',
        tripsBet: 0,
        sixCardBonusBet: 0,
        progressiveBet: 0,
      }))
      .mockImplementationOnce(() => ({
        playerCards: [],
        communityCards: [],
        dealerCards: [],
        stage: 'river',
        tripsBet: 0,
        sixCardBonusBet: 0,
        progressiveBet: 0,
      }));

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<UltimateTXHoldemScreen />);
    });

    const selector = findChipSelector(tree);
    act(() => {
      selector.props.onChipPlace(25);
    });

    setGameConnectionMessage({
      type: 'game_started',
      state: [1, 2, 3],
    });

    act(() => {
      tree.update(<UltimateTXHoldemScreen />);
    });

    const checkButton = findPrimaryButton(tree, 'CHECK');
    await act(async () => {
      await checkButton?.props.onPress?.();
    });
    expect(mockHaptics.buttonPress).toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledWith({ type: 'ultimate_tx_check' });

    setGameConnectionMessage({
      type: 'game_move',
      state: [9, 9, 9],
    });

    act(() => {
      tree.update(<UltimateTXHoldemScreen />);
    });

    const foldButton = findPrimaryButton(tree, 'FOLD');
    await act(async () => {
      await foldButton?.props.onPress?.();
    });
    expect(sendSpy).toHaveBeenCalledWith({ type: 'ultimate_tx_fold' });
  });
});
