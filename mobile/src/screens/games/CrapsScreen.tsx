/**
 * Craps Game Screen - Jony Ive Redesigned
 * Pass/Don't Pass visible, drawer for 40+ bet types
 */
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { useState, useCallback, useEffect, useMemo } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
  SlideInUp,
  SlideOutDown,
} from 'react-native-reanimated';
import { ChipSelector } from '../../components/casino';
import { GameLayout } from '../../components/game';
import { TutorialOverlay, PrimaryButton } from '../../components/ui';
import { haptics } from '../../services/haptics';
import { useGameKeyboard, KEY_ACTIONS, useGameConnection } from '../../hooks';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, GAME_COLORS, GAME_DETAIL_COLORS, SPRING } from '../../constants/theme';
import { useGameStore } from '../../stores/gameStore';
import { getDieFace } from '../../utils/dice';
import type { ChipValue, TutorialStep, CrapsBetType } from '../../types';
import type { CrapsMessage } from '@nullspace/protocol/mobile';

interface CrapsBet {
  type: CrapsBetType;
  amount: number;
  target?: number;
}

interface CrapsState {
  bets: CrapsBet[];
  dice: [number, number] | null;
  point: number | null;
  phase: 'comeout' | 'point' | 'rolling' | 'result';
  message: string;
  winAmount: number;
  lastResult: 'win' | 'loss' | null;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Come Out Roll',
    description: 'Pass Line wins on 7 or 11, loses on 2, 3, or 12. Any other number sets the Point.',
  },
  {
    title: 'Point Phase',
    description: 'Once Point is set, Pass wins if Point rolls again before 7. Don\'t Pass is the opposite.',
  },
  {
    title: 'More Bets',
    description: 'Tap "More Bets" for Come, Place, Hardways, and proposition bets with higher payouts!',
  },
];

const ESSENTIAL_BETS: CrapsBetType[] = ['PASS', 'DONT_PASS'];
const YES_NO_TARGETS = [4, 5, 6, 8, 9, 10];
const NEXT_TARGETS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const HARDWAY_TARGETS = [4, 6, 8, 10];

export function CrapsScreen() {
  // Shared hook for connection (Craps has multi-bet array so keeps custom bet state)
  const { isDisconnected, send, lastMessage, connectionStatusProps } = useGameConnection<CrapsMessage>();
  const { balance } = useGameStore();

  const [state, setState] = useState<CrapsState>({
    bets: [],
    dice: null,
    point: null,
    phase: 'comeout',
    message: 'Come out roll - Place your bets',
    winAmount: 0,
    lastResult: null,
  });
  const [selectedChip, setSelectedChip] = useState<ChipValue>(25);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const die1Rotation = useSharedValue(0);
  const die2Rotation = useSharedValue(0);

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'dice_roll') {
      // Animate dice - Reset then spin with physics settle
      die1Rotation.value = 0;
      die1Rotation.value = withSequence(
        withTiming(720, { duration: 300 }),
        withSpring(1080, SPRING.diceTumble)
      );
      
      die2Rotation.value = 0;
      die2Rotation.value = withSequence(
        withTiming(-720, { duration: 300 }),
        withSpring(-1080, SPRING.diceTumble)
      );
      haptics.diceRoll();

      setState((prev) => ({
        ...prev,
        dice: lastMessage.dice ?? null,
        point: lastMessage.point ?? prev.point,
      }));
    }

    if (lastMessage.type === 'game_result') {
      const won = lastMessage.won ?? false;
      if (won) {
        haptics.win();
      } else {
        haptics.loss();
      }

      setState((prev) => ({
        ...prev,
        phase: 'result',
        winAmount: lastMessage.winAmount ?? 0,
        lastResult: won ? 'win' : 'loss',
        message: lastMessage.message ?? (won ? 'Winner!' : 'Seven out!'),
      }));
    }
  }, [lastMessage]); // die1Rotation, die2Rotation are SharedValues (stable refs) - must not be in deps

  const die1Style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${die1Rotation.value}deg` }],
  }));

  const die2Style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${die2Rotation.value}deg` }],
  }));

  const addBet = useCallback((type: CrapsBetType, target?: number) => {
    if (state.phase === 'rolling') return;

    // Calculate current total bet
    const currentTotalBet = state.bets.reduce((sum, b) => sum + b.amount, 0);
    if (currentTotalBet + selectedChip > balance) {
      haptics.error();
      return;
    }

    haptics.chipPlace();

    setState((prev) => {
      const existingIndex = prev.bets.findIndex((b) => b.type === type && b.target === target);

      if (existingIndex >= 0) {
        const newBets = [...prev.bets];
        const existingBet = newBets[existingIndex];
        if (existingBet) {
          newBets[existingIndex] = {
            type: existingBet.type,
            amount: existingBet.amount + selectedChip,
            target: existingBet.target,
          };
        }
        return { ...prev, bets: newBets };
      }

      return {
        ...prev,
        bets: [...prev.bets, { type, amount: selectedChip, target }],
      };
    });
  }, [state.phase, selectedChip, state.bets, balance]);

  const handleRoll = useCallback(async () => {
    if (state.bets.length === 0) return;
    await haptics.diceRoll();

    send({
      type: 'craps_roll',
      bets: state.bets,
    });

    setState((prev) => ({
      ...prev,
      phase: 'rolling',
      message: 'Rolling...',
    }));
  }, [state.bets, send]);

  const handleNewGame = useCallback(() => {
    setState((prev) => ({
      ...prev,
      bets: [],
      dice: null,
      point: null,
      phase: 'comeout',
      message: 'Come out roll - Place your bets',
      winAmount: 0,
      lastResult: null,
    }));
  }, []);

  const handleChipPlace = useCallback((value: ChipValue) => {
    addBet('PASS');
  }, [addBet]);

  const totalBet = state.bets.reduce((sum, b) => sum + b.amount, 0);

  const handleClearBets = useCallback(() => {
    if (state.phase === 'rolling') return;
    setState((prev) => ({ ...prev, bets: [] }));
  }, [state.phase]);

  // Keyboard controls
  const keyboardHandlers = useMemo(() => ({
    [KEY_ACTIONS.SPACE]: () => {
      if (state.phase !== 'result' && state.phase !== 'rolling' && state.bets.length > 0 && !isDisconnected) handleRoll();
      else if (state.phase === 'result') handleNewGame();
    },
    [KEY_ACTIONS.ESCAPE]: () => handleClearBets(),
    [KEY_ACTIONS.ONE]: () => state.phase !== 'rolling' && setSelectedChip(1 as ChipValue),
    [KEY_ACTIONS.TWO]: () => state.phase !== 'rolling' && setSelectedChip(5 as ChipValue),
    [KEY_ACTIONS.THREE]: () => state.phase !== 'rolling' && setSelectedChip(25 as ChipValue),
    [KEY_ACTIONS.FOUR]: () => state.phase !== 'rolling' && setSelectedChip(100 as ChipValue),
    [KEY_ACTIONS.FIVE]: () => state.phase !== 'rolling' && setSelectedChip(500 as ChipValue),
  }), [state.phase, state.bets.length, isDisconnected, handleRoll, handleNewGame, handleClearBets]);

  useGameKeyboard(keyboardHandlers);

  return (
    <>
      <GameLayout
        title="Craps"
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
        {/* Point Display */}
      {state.point && (
        <View style={styles.pointContainer}>
          <Text style={styles.pointLabel}>POINT</Text>
          <Text style={styles.pointValue}>{state.point}</Text>
        </View>
      )}

      {/* Dice Display */}
      <View style={styles.diceContainer}>
        {state.dice ? (
          <>
            <Animated.View style={[styles.die, die1Style]}>
              <Text style={styles.dieFace}>{getDieFace(state.dice[0])}</Text>
            </Animated.View>
            <Animated.View style={[styles.die, die2Style]}>
              <Text style={styles.dieFace}>{getDieFace(state.dice[1])}</Text>
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
          </>
        )}
      </View>

      {/* Total Display */}
      {state.dice && (
        <Text style={styles.total}>{state.dice[0] + state.dice[1]}</Text>
      )}

      {/* Message */}
      <Text
        style={[
          styles.message,
          state.lastResult === 'win' && styles.messageWin,
          state.lastResult === 'loss' && styles.messageLoss,
        ]}
      >
        {state.message}
      </Text>

      {/* Win Amount */}
      {state.winAmount > 0 && (
        <Text style={styles.winAmount}>+${state.winAmount}</Text>
      )}

      {/* Essential Bets */}
      <View style={styles.essentialBets}>
        {ESSENTIAL_BETS.map((bet) => (
          <Pressable
            key={bet}
            onPress={() => addBet(bet)}
            disabled={state.phase === 'rolling' || isDisconnected}
            style={({ pressed }) => [
              styles.essentialBetButton,
              bet === 'PASS' && styles.passBet,
              bet === 'DONT_PASS' && styles.dontPassBet,
              pressed && styles.betPressed,
              isDisconnected && styles.betDisabled,
            ]}
          >
            <Text style={styles.essentialBetText}>
              {bet === 'PASS' ? 'PASS LINE' : "DON'T PASS"}
            </Text>
            {state.bets.find((b) => b.type === bet && b.target === undefined) && (
              <Text style={styles.betAmountLabel}>
                ${state.bets.find((b) => b.type === bet && b.target === undefined)?.amount}
              </Text>
            )}
          </Pressable>
        ))}
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
        {state.phase !== 'result' && (
          <PrimaryButton
            label="ROLL"
            onPress={handleRoll}
            disabled={state.bets.length === 0 || state.phase === 'rolling' || isDisconnected}
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
      {state.phase !== 'rolling' && (
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
              {/* Come Bets */}
              <Text style={styles.sectionTitle}>Come Bets</Text>
              <View style={styles.betRow}>
                <Pressable style={styles.advancedBet} onPress={() => addBet('COME')}>
                  <Text style={styles.advancedBetText}>COME</Text>
                </Pressable>
                <Pressable style={styles.advancedBet} onPress={() => addBet('DONT_COME')}>
                  <Text style={styles.advancedBetText}>DON'T COME</Text>
                </Pressable>
              </View>

              {/* Field */}
              <Text style={styles.sectionTitle}>Field</Text>
              <View style={styles.betRow}>
                <Pressable style={styles.advancedBet} onPress={() => addBet('FIELD')}>
                  <Text style={styles.advancedBetText}>FIELD</Text>
                </Pressable>
              </View>

              {/* YES (Place) */}
              <Text style={styles.sectionTitle}>YES (Place)</Text>
              <View style={styles.betRow}>
                {YES_NO_TARGETS.slice(0, 3).map((num) => (
                  <Pressable key={`yes-${num}`} style={styles.advancedBet} onPress={() => addBet('YES', num)}>
                    <Text style={styles.advancedBetText}>{num}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.betRow}>
                {YES_NO_TARGETS.slice(3).map((num) => (
                  <Pressable key={`yes-${num}`} style={styles.advancedBet} onPress={() => addBet('YES', num)}>
                    <Text style={styles.advancedBetText}>{num}</Text>
                  </Pressable>
                ))}
              </View>

              {/* NO (Lay) */}
              <Text style={styles.sectionTitle}>NO (Lay)</Text>
              <View style={styles.betRow}>
                {YES_NO_TARGETS.slice(0, 3).map((num) => (
                  <Pressable key={`no-${num}`} style={styles.advancedBet} onPress={() => addBet('NO', num)}>
                    <Text style={styles.advancedBetText}>{num}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.betRow}>
                {YES_NO_TARGETS.slice(3).map((num) => (
                  <Pressable key={`no-${num}`} style={styles.advancedBet} onPress={() => addBet('NO', num)}>
                    <Text style={styles.advancedBetText}>{num}</Text>
                  </Pressable>
                ))}
              </View>

              {/* NEXT (Hop) */}
              <Text style={styles.sectionTitle}>NEXT (Hop)</Text>
              <View style={styles.betRow}>
                {NEXT_TARGETS.slice(0, 6).map((num) => (
                  <Pressable key={`next-${num}`} style={styles.advancedBet} onPress={() => addBet('NEXT', num)}>
                    <Text style={styles.advancedBetText}>{num}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.betRow}>
                {NEXT_TARGETS.slice(6).map((num) => (
                  <Pressable key={`next-${num}`} style={styles.advancedBet} onPress={() => addBet('NEXT', num)}>
                    <Text style={styles.advancedBetText}>{num}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Hardways */}
              <Text style={styles.sectionTitle}>Hardways</Text>
              <View style={styles.betRow}>
                {HARDWAY_TARGETS.map((num) => (
                  <Pressable key={`hard-${num}`} style={styles.advancedBet} onPress={() => addBet('HARDWAY', num)}>
                    <Text style={styles.advancedBetText}>H{num}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Fire + ATS */}
              <Text style={styles.sectionTitle}>Fire + ATS</Text>
              <View style={styles.betRow}>
                <Pressable style={styles.advancedBet} onPress={() => addBet('FIRE')}>
                  <Text style={styles.advancedBetText}>FIRE</Text>
                </Pressable>
                <Pressable style={styles.advancedBet} onPress={() => addBet('ATS_SMALL')}>
                  <Text style={styles.advancedBetText}>ATS SMALL</Text>
                </Pressable>
              </View>
              <View style={styles.betRow}>
                <Pressable style={styles.advancedBet} onPress={() => addBet('ATS_TALL')}>
                  <Text style={styles.advancedBetText}>ATS TALL</Text>
                </Pressable>
                <Pressable style={styles.advancedBet} onPress={() => addBet('ATS_ALL')}>
                  <Text style={styles.advancedBetText}>ATS ALL</Text>
                </Pressable>
              </View>

              {/* Side Bets */}
              <Text style={styles.sectionTitle}>Side Bets</Text>
              <View style={styles.betRow}>
                <Pressable style={styles.advancedBet} onPress={() => addBet('MUGGSY')}>
                  <Text style={styles.advancedBetText}>MUGGSY</Text>
                </Pressable>
                <Pressable style={styles.advancedBet} onPress={() => addBet('DIFF_DOUBLES')}>
                  <Text style={styles.advancedBetText}>DIFF DOUBLES</Text>
                </Pressable>
              </View>
              <View style={styles.betRow}>
                <Pressable style={styles.advancedBet} onPress={() => addBet('RIDE_LINE')}>
                  <Text style={styles.advancedBetText}>RIDE LINE</Text>
                </Pressable>
                <Pressable style={styles.advancedBet} onPress={() => addBet('REPLAY')}>
                  <Text style={styles.advancedBetText}>REPLAY</Text>
                </Pressable>
              </View>
              <View style={styles.betRow}>
                <Pressable style={styles.advancedBet} onPress={() => addBet('HOT_ROLLER')}>
                  <Text style={styles.advancedBetText}>HOT ROLLER</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      {/* Tutorial */}
      <TutorialOverlay
        gameId="craps"
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
  pointContainer: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  pointLabel: {
    color: COLORS.gold,
    ...TYPOGRAPHY.label,
  },
  pointValue: {
    color: COLORS.gold,
    ...TYPOGRAPHY.displayLarge,
  },
  diceContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.lg,
    marginVertical: SPACING.lg,
  },
  die: {
    width: 80,
    height: 80,
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
    fontSize: 56,
  },
  diePlaceholder: {
    width: 80,
    height: 80,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  diePlaceholderText: {
    fontSize: 40,
    opacity: 0.3,
  },
  total: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.displayMedium,
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
  messageLoss: {
    color: COLORS.error,
  },
  winAmount: {
    color: COLORS.success,
    ...TYPOGRAPHY.h2,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  essentialBets: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  essentialBetButton: {
    flex: 1,
    maxWidth: 160,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  passBet: {
    backgroundColor: GAME_DETAIL_COLORS.craps.pass,
  },
  dontPassBet: {
    backgroundColor: GAME_DETAIL_COLORS.craps.dontPass,
  },
  betPressed: {
    opacity: 0.7,
  },
  betDisabled: {
    opacity: 0.5,
  },
  essentialBetText: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.label,
  },
  betAmountLabel: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.caption,
    marginTop: 4,
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
  betRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  advancedBet: {
    flex: 1,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  advancedBetText: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.bodySmall,
  },
});
