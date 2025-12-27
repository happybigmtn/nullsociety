/**
 * Baccarat Game Screen - Jony Ive Redesigned
 * Epitome of simplicity - only 3 betting options
 */
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useState, useCallback, useEffect, useMemo } from 'react';
import Animated, { FadeIn, SlideInUp, SlideInDown } from 'react-native-reanimated';
import { Card } from '../../components/casino';
import { ChipSelector } from '../../components/casino';
import { GameLayout } from '../../components/game';
import { TutorialOverlay, PrimaryButton } from '../../components/ui';
import { haptics } from '../../services/haptics';
import { useGameKeyboard, KEY_ACTIONS, useGameConnection } from '../../hooks';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../constants/theme';
import { useGameStore } from '../../stores/gameStore';
import type { ChipValue, TutorialStep, BaccaratBetType, Card as CardType } from '../../types';
import type { BaccaratMessage } from '../../types/protocol';

interface BaccaratState {
  bets: Record<BaccaratBetType, number>;
  playerCards: CardType[];
  bankerCards: CardType[];
  playerTotal: number;
  bankerTotal: number;
  phase: 'betting' | 'dealing' | 'result';
  message: string;
  winner: BaccaratBetType | null;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Three Choices',
    description: 'Bet on Player, Banker, or Tie. That\'s it! Cards are dealt automatically.',
  },
  {
    title: 'Closest to 9',
    description: 'The hand closest to 9 wins. Face cards = 0, Aces = 1. If over 9, drop the tens digit.',
  },
  {
    title: 'Payouts',
    description: 'Player pays 1:1, Banker pays 0.95:1 (5% commission), Tie pays 8:1.',
  },
];

export function BaccaratScreen() {
  // Shared hook for connection (Baccarat has multi-bet so keeps custom bet state)
  const { isDisconnected, send, lastMessage, connectionStatusProps } = useGameConnection<BaccaratMessage>();
  const { balance } = useGameStore();

  const [state, setState] = useState<BaccaratState>({
    bets: { PLAYER: 0, BANKER: 0, TIE: 0 },
    playerCards: [],
    bankerCards: [],
    playerTotal: 0,
    bankerTotal: 0,
    phase: 'betting',
    message: 'Place your bet',
    winner: null,
  });
  const [selectedChip, setSelectedChip] = useState<ChipValue>(25);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'cards_dealt') {
      haptics.cardDeal();
      setState((prev) => ({
        ...prev,
        playerCards: lastMessage.playerCards ?? [],
        bankerCards: lastMessage.bankerCards ?? [],
        playerTotal: lastMessage.playerTotal ?? 0,
        bankerTotal: lastMessage.bankerTotal ?? 0,
      }));
    }

    if (lastMessage.type === 'game_result') {
      const winner = lastMessage.winner;
      const betOnWinner = winner && state.bets[winner] > 0;

      if (betOnWinner) {
        haptics.win();
      } else {
        haptics.loss();
      }

      setState((prev) => ({
        ...prev,
        phase: 'result',
        playerCards: lastMessage.playerCards ?? prev.playerCards,
        bankerCards: lastMessage.bankerCards ?? prev.bankerCards,
        playerTotal: lastMessage.playerTotal ?? prev.playerTotal,
        bankerTotal: lastMessage.bankerTotal ?? prev.bankerTotal,
        winner: winner ?? null,
        message: lastMessage.message ?? `${winner} wins!`,
      }));
    }
  }, [lastMessage, state.bets]);

  const handleBet = useCallback((type: BaccaratBetType) => {
    if (state.phase !== 'betting') return;

    // Calculate current total bet
    const currentTotalBet = Object.values(state.bets).reduce((a, b) => a + b, 0);
    if (currentTotalBet + selectedChip > balance) {
      haptics.error();
      return;
    }

    haptics.chipPlace();

    setState((prev) => ({
      ...prev,
      bets: {
        ...prev.bets,
        [type]: prev.bets[type] + selectedChip,
      },
    }));
  }, [state.phase, selectedChip, state.bets, balance]);

  const handleDeal = useCallback(async () => {
    const totalBet = Object.values(state.bets).reduce((a, b) => a + b, 0);
    if (totalBet === 0) return;
    await haptics.betConfirm();

    send({
      type: 'baccarat_deal',
      bets: state.bets,
    });

    setState((prev) => ({
      ...prev,
      phase: 'dealing',
      message: 'Dealing...',
    }));
  }, [state.bets, send]);

  const handleNewGame = useCallback(() => {
    setState({
      bets: { PLAYER: 0, BANKER: 0, TIE: 0 },
      playerCards: [],
      bankerCards: [],
      playerTotal: 0,
      bankerTotal: 0,
      phase: 'betting',
      message: 'Place your bet',
      winner: null,
    });
  }, []);

  const handleChipPlace = useCallback((_value: ChipValue) => {
    handleBet('PLAYER');
  }, [handleBet]);

  const totalBet = Object.values(state.bets).reduce((a, b) => a + b, 0);

  const handleClearBets = useCallback(() => {
    if (state.phase !== 'betting') return;
    setState((prev) => ({ ...prev, bets: { PLAYER: 0, BANKER: 0, TIE: 0 } }));
  }, [state.phase]);

  // Keyboard controls
  const keyboardHandlers = useMemo(() => ({
    [KEY_ACTIONS.LEFT]: () => state.phase === 'betting' && !isDisconnected && handleBet('PLAYER'),
    [KEY_ACTIONS.RIGHT]: () => state.phase === 'betting' && !isDisconnected && handleBet('BANKER'),
    [KEY_ACTIONS.SPACE]: () => {
      if (state.phase === 'betting' && totalBet > 0 && !isDisconnected) handleDeal();
      else if (state.phase === 'result') handleNewGame();
    },
    [KEY_ACTIONS.ESCAPE]: () => handleClearBets(),
    [KEY_ACTIONS.ONE]: () => state.phase === 'betting' && setSelectedChip(1 as ChipValue),
    [KEY_ACTIONS.TWO]: () => state.phase === 'betting' && setSelectedChip(5 as ChipValue),
    [KEY_ACTIONS.THREE]: () => state.phase === 'betting' && setSelectedChip(25 as ChipValue),
    [KEY_ACTIONS.FOUR]: () => state.phase === 'betting' && setSelectedChip(100 as ChipValue),
    [KEY_ACTIONS.FIVE]: () => state.phase === 'betting' && setSelectedChip(500 as ChipValue),
  }), [state.phase, totalBet, isDisconnected, handleBet, handleDeal, handleNewGame, handleClearBets]);

  useGameKeyboard(keyboardHandlers);

  return (
    <>
      <GameLayout
        title="Baccarat"
        balance={balance}
        onHelpPress={() => setShowTutorial(true)}
        connectionStatus={connectionStatusProps}
      >
        {/* Game Area */}
        <View style={styles.gameArea}>
          {/* Banker Hand */}
          <View style={styles.handContainer}>
            <View style={styles.handHeader}>
              <Text style={styles.handLabel}>BANKER</Text>
              {state.bankerCards.length > 0 && (
                <Text style={styles.handTotal}>{state.bankerTotal}</Text>
              )}
            </View>
            <View style={styles.cards}>
              {state.bankerCards.map((card, i) => (
                <Animated.View
                  key={i}
                  entering={SlideInDown.delay(i * 150 + 300)}
                  style={[styles.cardWrapper, { marginLeft: i > 0 ? -30 : 0 }]}
                >
                  <Card suit={card.suit} rank={card.rank} faceUp={true} />
                </Animated.View>
              ))}
            </View>
            {state.winner === 'BANKER' && (
              <Animated.View entering={FadeIn} style={styles.winnerBadge}>
                <Text style={styles.winnerText}>WINNER</Text>
              </Animated.View>
            )}
          </View>

          {/* Message */}
          <Text
            style={[
              styles.message,
              state.winner === 'TIE' && styles.messageTie,
            ]}
          >
            {state.message}
          </Text>

          {/* Player Hand */}
          <View style={styles.handContainer}>
            <View style={styles.handHeader}>
              <Text style={styles.handLabel}>PLAYER</Text>
              {state.playerCards.length > 0 && (
                <Text style={styles.handTotal}>{state.playerTotal}</Text>
              )}
            </View>
            <View style={styles.cards}>
              {state.playerCards.map((card, i) => (
                <Animated.View
                  key={i}
                  entering={SlideInUp.delay(i * 150)}
                  style={[styles.cardWrapper, { marginLeft: i > 0 ? -30 : 0 }]}
                >
                  <Card suit={card.suit} rank={card.rank} faceUp={true} />
                </Animated.View>
              ))}
            </View>
            {state.winner === 'PLAYER' && (
              <Animated.View entering={FadeIn} style={styles.winnerBadge}>
                <Text style={styles.winnerText}>WINNER</Text>
              </Animated.View>
            )}
          </View>
        </View>

        {/* Betting Options */}
        <View style={styles.betOptions}>
          {(['PLAYER', 'TIE', 'BANKER'] as BaccaratBetType[]).map((type) => (
            <Pressable
              key={type}
              onPress={() => handleBet(type)}
              disabled={state.phase !== 'betting' || isDisconnected}
              style={({ pressed }) => [
                styles.betOption,
                type === 'TIE' && styles.betOptionTie,
                state.winner === type && styles.betOptionWinner,
                pressed && styles.betOptionPressed,
                isDisconnected && styles.betOptionDisabled,
              ]}
            >
              <Text style={styles.betOptionLabel}>{type}</Text>
              <Text style={styles.betOptionOdds}>
                {type === 'PLAYER' ? '1:1' : type === 'BANKER' ? '0.95:1' : '8:1'}
              </Text>
              {state.bets[type] > 0 && (
                <Text style={styles.betOptionAmount}>${state.bets[type]}</Text>
              )}
            </Pressable>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {state.phase === 'betting' && (
            <PrimaryButton
              label="DEAL"
              onPress={handleDeal}
              disabled={totalBet === 0 || isDisconnected}
              variant="primary"
              size="large"
            />
          )}

          {state.phase === 'result' && (
            <PrimaryButton
              label="NEW GAME"
              onPress={handleNewGame}
              variant="primary"
              size="large"
            />
          )}
        </View>

        {/* Chip Selector */}
        {state.phase === 'betting' && (
          <ChipSelector
            selectedValue={selectedChip}
            onSelect={setSelectedChip}
            onChipPlace={handleChipPlace}
          />
        )}
      </GameLayout>

      {/* Tutorial */}
      <TutorialOverlay
        gameId="baccarat"
        steps={TUTORIAL_STEPS}
        onComplete={() => setShowTutorial(false)}
        forceShow={showTutorial}
      />
    </>
  );
}

const styles = StyleSheet.create({
  gameArea: {
    flex: 1,
    justifyContent: 'space-around',
    paddingHorizontal: SPACING.md,
  },
  handContainer: {
    alignItems: 'center',
  },
  handHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  handLabel: {
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.label,
  },
  handTotal: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.h2,
  },
  cards: {
    flexDirection: 'row',
    minHeight: 120,
  },
  cardWrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  winnerBadge: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.gold,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
  },
  winnerText: {
    color: COLORS.background,
    ...TYPOGRAPHY.label,
  },
  message: {
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.h3,
    textAlign: 'center',
  },
  messageTie: {
    color: COLORS.gold,
  },
  betOptions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  betOption: {
    flex: 1,
    maxWidth: 110,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  betOptionTie: {
    backgroundColor: COLORS.surface,
  },
  betOptionWinner: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.surface,
  },
  betOptionPressed: {
    opacity: 0.7,
  },
  betOptionDisabled: {
    opacity: 0.5,
  },
  betOptionLabel: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.label,
  },
  betOptionOdds: {
    color: COLORS.textMuted,
    ...TYPOGRAPHY.caption,
    marginTop: 2,
  },
  betOptionAmount: {
    color: COLORS.gold,
    ...TYPOGRAPHY.bodySmall,
    marginTop: SPACING.xs,
  },
  actions: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
});
