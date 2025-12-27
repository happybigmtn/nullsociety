/**
 * Sic Bo Game Screen - Jony Ive Redesigned
 * 3 dice with Big/Small quick bets, drawer for advanced bets
 */
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { useState, useCallback, useEffect, useMemo } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  SlideInUp,
  SlideOutDown,
} from 'react-native-reanimated';
import { ChipSelector } from '../../components/casino';
import { GameLayout } from '../../components/game';
import { TutorialOverlay, PrimaryButton } from '../../components/ui';
import { haptics } from '../../services/haptics';
import { useGameKeyboard, KEY_ACTIONS, useGameConnection } from '../../hooks';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../constants/theme';
import { useGameStore } from '../../stores/gameStore';
import { getDieFace } from '../../utils/dice';
import type { ChipValue, TutorialStep, SicBoBetType } from '../../types';
import type { SicBoMessage } from '../../types/protocol';

interface SicBoBet {
  type: SicBoBetType;
  amount: number;
  value?: number;
}

interface SicBoState {
  bets: SicBoBet[];
  dice: [number, number, number] | null;
  total: number;
  phase: 'betting' | 'rolling' | 'result';
  message: string;
  winAmount: number;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Three Dice',
    description: 'Predict the outcome of three dice. Small (4-10) or Big (11-17) are the easiest bets.',
  },
  {
    title: 'Totals & Triples',
    description: 'Bet on specific totals (4-17) or triples. Specific triple pays 180:1!',
  },
  {
    title: 'Any Triple',
    description: 'Any Triple (all three dice match) pays 30:1. Big risk, big reward!',
  },
];

export function SicBoScreen() {
  // Shared hook for connection (SicBo has multi-bet so keeps custom bet state)
  const { isDisconnected, send, lastMessage, connectionStatusProps } = useGameConnection<SicBoMessage>();
  const { balance } = useGameStore();

  const [state, setState] = useState<SicBoState>({
    bets: [],
    dice: null,
    total: 0,
    phase: 'betting',
    message: 'Place your bets',
    winAmount: 0,
  });
  const [selectedChip, setSelectedChip] = useState<ChipValue>(25);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const dice1Bounce = useSharedValue(0);
  const dice2Bounce = useSharedValue(0);
  const dice3Bounce = useSharedValue(0);

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'dice_roll') {
      // Animate dice bouncing
      dice1Bounce.value = withSequence(
        withTiming(-20, { duration: 100 }),
        withTiming(0, { duration: 100 }),
        withTiming(-10, { duration: 80 }),
        withTiming(0, { duration: 80 })
      );
      dice2Bounce.value = withSequence(
        withTiming(-25, { duration: 120 }),
        withTiming(0, { duration: 100 }),
        withTiming(-12, { duration: 80 }),
        withTiming(0, { duration: 80 })
      );
      dice3Bounce.value = withSequence(
        withTiming(-22, { duration: 110 }),
        withTiming(0, { duration: 100 }),
        withTiming(-8, { duration: 80 }),
        withTiming(0, { duration: 80 })
      );
      haptics.diceRoll();

      const dice = lastMessage.dice;
      if (dice) {
        setState((prev) => ({
          ...prev,
          dice,
          total: dice[0] + dice[1] + dice[2],
        }));
      }
    }

    if (lastMessage.type === 'game_result') {
      const won = (lastMessage.winAmount ?? 0) > 0;
      if (won) {
        haptics.win();
      } else {
        haptics.loss();
      }

      setState((prev) => ({
        ...prev,
        phase: 'result',
        winAmount: lastMessage.winAmount ?? 0,
        message: lastMessage.message ?? (won ? 'You win!' : 'No luck'),
      }));
    }
  }, [lastMessage]); // dice1Bounce, dice2Bounce, dice3Bounce are SharedValues (stable refs) - must not be in deps

  const dice1Style = useAnimatedStyle(() => ({
    transform: [{ translateY: dice1Bounce.value }],
  }));
  const dice2Style = useAnimatedStyle(() => ({
    transform: [{ translateY: dice2Bounce.value }],
  }));
  const dice3Style = useAnimatedStyle(() => ({
    transform: [{ translateY: dice3Bounce.value }],
  }));

  const addBet = useCallback((type: SicBoBetType, value?: number) => {
    if (state.phase !== 'betting') return;

    // Calculate current total bet
    const currentTotalBet = state.bets.reduce((sum, b) => sum + b.amount, 0);
    if (currentTotalBet + selectedChip > balance) {
      haptics.error();
      return;
    }

    haptics.chipPlace();

    setState((prev) => {
      const existingIndex = prev.bets.findIndex(
        (b) => b.type === type && b.value === value
      );

      if (existingIndex >= 0) {
        const newBets = [...prev.bets];
        const existingBet = newBets[existingIndex];
        if (existingBet) {
          newBets[existingIndex] = {
            type: existingBet.type,
            amount: existingBet.amount + selectedChip,
            value: existingBet.value,
          };
        }
        return { ...prev, bets: newBets };
      }

      return {
        ...prev,
        bets: [...prev.bets, { type, amount: selectedChip, value }],
      };
    });
  }, [state.phase, selectedChip, state.bets, balance]);

  const handleRoll = useCallback(async () => {
    if (state.bets.length === 0) return;
    await haptics.diceRoll();

    send({
      type: 'sic_bo_roll',
      bets: state.bets,
    });

    setState((prev) => ({
      ...prev,
      phase: 'rolling',
      message: 'Rolling...',
    }));
  }, [state.bets, send]);

  const handleNewGame = useCallback(() => {
    setState({
      bets: [],
      dice: null,
      total: 0,
      phase: 'betting',
      message: 'Place your bets',
      winAmount: 0,
    });
  }, []);

  const handleChipPlace = useCallback((value: ChipValue) => {
    addBet('BIG');
  }, [addBet]);

  const totalBet = state.bets.reduce((sum, b) => sum + b.amount, 0);

  const handleClearBets = useCallback(() => {
    if (state.phase !== 'betting') return;
    setState((prev) => ({ ...prev, bets: [] }));
  }, [state.phase]);

  // Keyboard controls
  const keyboardHandlers = useMemo(() => ({
    [KEY_ACTIONS.SPACE]: () => {
      if (state.phase === 'betting' && state.bets.length > 0 && !isDisconnected) handleRoll();
      else if (state.phase === 'result') handleNewGame();
    },
    [KEY_ACTIONS.ESCAPE]: () => handleClearBets(),
    [KEY_ACTIONS.ONE]: () => state.phase === 'betting' && setSelectedChip(1 as ChipValue),
    [KEY_ACTIONS.TWO]: () => state.phase === 'betting' && setSelectedChip(5 as ChipValue),
    [KEY_ACTIONS.THREE]: () => state.phase === 'betting' && setSelectedChip(25 as ChipValue),
    [KEY_ACTIONS.FOUR]: () => state.phase === 'betting' && setSelectedChip(100 as ChipValue),
    [KEY_ACTIONS.FIVE]: () => state.phase === 'betting' && setSelectedChip(500 as ChipValue),
  }), [state.phase, state.bets.length, isDisconnected, handleRoll, handleNewGame, handleClearBets]);

  useGameKeyboard(keyboardHandlers);

  return (
    <>
      <GameLayout
        title="Sic Bo"
        balance={balance}
        onHelpPress={() => setShowTutorial(true)}
        connectionStatus={connectionStatusProps}
        headerRightContent={
          <Pressable
            onPress={() => setShowAdvanced(true)}
            style={styles.moreBetsButton}
          >
            <Text style={styles.moreBetsText}>More Bets</Text>
          </Pressable>
        }
      >
        {/* Dice Display */}
      <View style={styles.diceContainer}>
        {state.dice ? (
          <>
            <Animated.View style={[styles.die, dice1Style]}>
              <Text style={styles.dieFace}>{getDieFace(state.dice[0])}</Text>
            </Animated.View>
            <Animated.View style={[styles.die, dice2Style]}>
              <Text style={styles.dieFace}>{getDieFace(state.dice[1])}</Text>
            </Animated.View>
            <Animated.View style={[styles.die, dice3Style]}>
              <Text style={styles.dieFace}>{getDieFace(state.dice[2])}</Text>
            </Animated.View>
          </>
        ) : (
          <>
            <View style={styles.diePlaceholder}>
              <Text style={styles.diePlaceholderText}>🎲</Text>
            </View>
            <View style={styles.diePlaceholder}>
              <Text style={styles.diePlaceholderText}>🎲</Text>
            </View>
            <View style={styles.diePlaceholder}>
              <Text style={styles.diePlaceholderText}>🎲</Text>
            </View>
          </>
        )}
      </View>

      {/* Total */}
      {state.dice && (
        <Text style={styles.total}>Total: {state.total}</Text>
      )}

      {/* Message */}
      <Text
        style={[
          styles.message,
          state.winAmount > 0 && styles.messageWin,
        ]}
      >
        {state.message}
      </Text>

      {/* Win Amount */}
      {state.winAmount > 0 && (
        <Text style={styles.winAmount}>+${state.winAmount}</Text>
      )}

      {/* Quick Bets */}
      <View style={styles.quickBets}>
        <Pressable
          onPress={() => addBet('SMALL')}
          disabled={state.phase !== 'betting' || isDisconnected}
          style={({ pressed }) => [
            styles.quickBetButton,
            pressed && styles.quickBetPressed,
            isDisconnected && styles.quickBetDisabled,
          ]}
        >
          <Text style={styles.quickBetLabel}>SMALL</Text>
          <Text style={styles.quickBetRange}>4-10</Text>
          <Text style={styles.quickBetOdds}>1:1</Text>
        </Pressable>

        <Pressable
          onPress={() => addBet('BIG')}
          disabled={state.phase !== 'betting' || isDisconnected}
          style={({ pressed }) => [
            styles.quickBetButton,
            pressed && styles.quickBetPressed,
            isDisconnected && styles.quickBetDisabled,
          ]}
        >
          <Text style={styles.quickBetLabel}>BIG</Text>
          <Text style={styles.quickBetRange}>11-17</Text>
          <Text style={styles.quickBetOdds}>1:1</Text>
        </Pressable>
      </View>

      {/* Bet Summary */}
      {totalBet > 0 && (
        <View style={styles.betSummary}>
          <Text style={styles.betLabel}>Total Bet</Text>
          <Text style={styles.betAmount}>${totalBet}</Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {state.phase === 'betting' && (
          <PrimaryButton
            label="ROLL"
            onPress={handleRoll}
            disabled={state.bets.length === 0 || isDisconnected}
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

      {/* Advanced Bets Drawer */}
      <Modal visible={showAdvanced} transparent animationType="slide">
        <View style={styles.drawerOverlay}>
          <Animated.View
            entering={SlideInUp.duration(300)}
            exiting={SlideOutDown.duration(200)}
            style={styles.drawer}
          >
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>All Bets</Text>
              <Pressable onPress={() => setShowAdvanced(false)}>
                <Text style={styles.drawerClose}>✕</Text>
              </Pressable>
            </View>

            <ScrollView>
              {/* Totals */}
              <Text style={styles.sectionTitle}>Totals</Text>
              <View style={styles.totalsGrid}>
                {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((num) => (
                  <Pressable
                    key={num}
                    style={styles.totalBet}
                    onPress={() => addBet(`TOTAL_${num}` as SicBoBetType)}
                  >
                    <Text style={styles.totalNumber}>{num}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Singles */}
              <Text style={styles.sectionTitle}>Single Number (1:1)</Text>
              <View style={styles.betRow}>
                {[1, 2, 3, 4, 5, 6].map((num) => (
                  <Pressable
                    key={num}
                    style={styles.singleBet}
                    onPress={() => addBet('SINGLE', num)}
                  >
                    <Text style={styles.singleNumber}>{getDieFace(num)}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Triples */}
              <Text style={styles.sectionTitle}>Triples</Text>
              <View style={styles.betRow}>
                <Pressable
                  style={styles.tripleBet}
                  onPress={() => addBet('ANY_TRIPLE')}
                >
                  <Text style={styles.tripleLabel}>Any Triple</Text>
                  <Text style={styles.tripleOdds}>30:1</Text>
                </Pressable>
              </View>
              <View style={styles.betRow}>
                {[1, 2, 3, 4, 5, 6].map((num) => (
                  <Pressable
                    key={num}
                    style={styles.specificTriple}
                    onPress={() => addBet('SPECIFIC_TRIPLE', num)}
                  >
                    <Text style={styles.specificTripleText}>
                      {getDieFace(num)}{getDieFace(num)}{getDieFace(num)}
                    </Text>
                    <Text style={styles.specificTripleOdds}>180:1</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      {/* Tutorial */}
      <TutorialOverlay
        gameId="sic_bo"
        steps={TUTORIAL_STEPS}
        onComplete={() => setShowTutorial(false)}
        forceShow={showTutorial}
      />
    </>
  );
}

const styles = StyleSheet.create({
  moreBetsButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
  },
  moreBetsText: {
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.bodySmall,
  },
  diceContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.md,
    marginVertical: SPACING.lg,
  },
  die: {
    width: 64,
    height: 64,
    backgroundColor: COLORS.textPrimary,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  dieFace: {
    fontSize: 40,
  },
  diePlaceholder: {
    width: 64,
    height: 64,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  diePlaceholderText: {
    fontSize: 32,
    opacity: 0.3,
  },
  total: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.h2,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  message: {
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.h3,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  messageWin: {
    color: COLORS.success,
  },
  winAmount: {
    color: COLORS.gold,
    ...TYPOGRAPHY.displayMedium,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  quickBets: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  quickBetButton: {
    flex: 1,
    maxWidth: 140,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickBetPressed: {
    opacity: 0.7,
  },
  quickBetDisabled: {
    opacity: 0.5,
  },
  quickBetLabel: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.label,
  },
  quickBetRange: {
    color: COLORS.textMuted,
    ...TYPOGRAPHY.caption,
  },
  quickBetOdds: {
    color: COLORS.gold,
    ...TYPOGRAPHY.caption,
  },
  betSummary: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  betLabel: {
    color: COLORS.textMuted,
    ...TYPOGRAPHY.caption,
  },
  betAmount: {
    color: COLORS.gold,
    ...TYPOGRAPHY.h2,
  },
  actions: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  drawerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  drawer: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.md,
    maxHeight: '70%',
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  drawerTitle: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.h2,
  },
  drawerClose: {
    color: COLORS.textSecondary,
    fontSize: 24,
    padding: SPACING.xs,
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.label,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  totalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  totalBet: {
    width: 44,
    height: 44,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalNumber: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.label,
  },
  betRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  singleBet: {
    width: 48,
    height: 48,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleNumber: {
    fontSize: 28,
  },
  tripleBet: {
    flex: 1,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  tripleLabel: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.label,
  },
  tripleOdds: {
    color: COLORS.gold,
    ...TYPOGRAPHY.caption,
  },
  specificTriple: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  specificTripleText: {
    fontSize: 16,
  },
  specificTripleOdds: {
    color: COLORS.gold,
    ...TYPOGRAPHY.caption,
  },
});
