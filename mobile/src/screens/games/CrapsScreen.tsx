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
  SlideInUp,
  SlideOutDown,
} from 'react-native-reanimated';
import { ChipSelector } from '../../components/casino';
import { GameLayout } from '../../components/game';
import { TutorialOverlay, PrimaryButton } from '../../components/ui';
import { useWebSocket, getWebSocketUrl } from '../../services/websocket';
import { haptics } from '../../services/haptics';
import { useGameKeyboard, KEY_ACTIONS } from '../../hooks/useKeyboardControls';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, GAME_COLORS, GAME_DETAIL_COLORS } from '../../constants/theme';
import { useGameStore } from '../../stores/gameStore';
import { getDieFace } from '../../utils/dice';
import type { ChipValue, TutorialStep, CrapsBetType } from '../../types';
import type { CrapsMessage } from '../../types/protocol';

interface CrapsBet {
  type: CrapsBetType;
  amount: number;
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

export function CrapsScreen() {
  const { balance, updateBalance } = useGameStore();
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
  const {
    isConnected,
    connectionState,
    reconnectAttempt,
    maxReconnectAttempts,
    send,
    lastMessage,
    reconnect,
  } = useWebSocket<CrapsMessage>(getWebSocketUrl());

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'dice_roll') {
      // Animate dice
      die1Rotation.value = withSequence(
        withTiming(360, { duration: 200 }),
        withTiming(720, { duration: 200 }),
        withTiming(0, { duration: 100 })
      );
      die2Rotation.value = withSequence(
        withTiming(-360, { duration: 200 }),
        withTiming(-720, { duration: 200 }),
        withTiming(0, { duration: 100 })
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

  const addBet = useCallback((type: CrapsBetType) => {
    if (state.phase === 'rolling') return;

    // Calculate current total bet
    const currentTotalBet = state.bets.reduce((sum, b) => sum + b.amount, 0);
    if (currentTotalBet + selectedChip > balance) {
      haptics.error();
      return;
    }

    haptics.chipPlace();

    setState((prev) => {
      const existingIndex = prev.bets.findIndex((b) => b.type === type);

      if (existingIndex >= 0) {
        const newBets = [...prev.bets];
        const existingBet = newBets[existingIndex];
        if (existingBet) {
          newBets[existingIndex] = {
            type: existingBet.type,
            amount: existingBet.amount + selectedChip,
          };
        }
        return { ...prev, bets: newBets };
      }

      return {
        ...prev,
        bets: [...prev.bets, { type, amount: selectedChip }],
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
  const isDisconnected = connectionState !== 'connected';

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
        connectionStatus={{
          connectionState,
          reconnectAttempt,
          maxReconnectAttempts,
          onRetry: reconnect,
        }}
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
            {state.bets.find((b) => b.type === bet) && (
              <Text style={styles.betAmountLabel}>
                ${state.bets.find((b) => b.type === bet)?.amount}
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

              {/* Place Bets */}
              <Text style={styles.sectionTitle}>Place Bets</Text>
              <View style={styles.betRow}>
                {(['PLACE_4', 'PLACE_5', 'PLACE_6'] as CrapsBetType[]).map((bet) => (
                  <Pressable key={bet} style={styles.advancedBet} onPress={() => addBet(bet)}>
                    <Text style={styles.advancedBetText}>{bet.replace('PLACE_', '')}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.betRow}>
                {(['PLACE_8', 'PLACE_9', 'PLACE_10'] as CrapsBetType[]).map((bet) => (
                  <Pressable key={bet} style={styles.advancedBet} onPress={() => addBet(bet)}>
                    <Text style={styles.advancedBetText}>{bet.replace('PLACE_', '')}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Hardways */}
              <Text style={styles.sectionTitle}>Hardways (7:1 to 9:1)</Text>
              <View style={styles.betRow}>
                {(['HARD_4', 'HARD_6', 'HARD_8', 'HARD_10'] as CrapsBetType[]).map((bet) => (
                  <Pressable key={bet} style={styles.advancedBet} onPress={() => addBet(bet)}>
                    <Text style={styles.advancedBetText}>{bet.replace('HARD_', 'H')}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Props */}
              <Text style={styles.sectionTitle}>Propositions</Text>
              <View style={styles.betRow}>
                <Pressable style={styles.advancedBet} onPress={() => addBet('ANY_7')}>
                  <Text style={styles.advancedBetText}>Any 7 (4:1)</Text>
                </Pressable>
                <Pressable style={styles.advancedBet} onPress={() => addBet('ANY_CRAPS')}>
                  <Text style={styles.advancedBetText}>Any Craps (7:1)</Text>
                </Pressable>
              </View>
              <View style={styles.betRow}>
                <Pressable style={styles.advancedBet} onPress={() => addBet('YO_11')}>
                  <Text style={styles.advancedBetText}>Yo 11 (15:1)</Text>
                </Pressable>
                <Pressable style={styles.advancedBet} onPress={() => addBet('SNAKE_EYES')}>
                  <Text style={styles.advancedBetText}>Snake Eyes (30:1)</Text>
                </Pressable>
              </View>
              <View style={styles.betRow}>
                <Pressable style={styles.advancedBet} onPress={() => addBet('BOXCARS')}>
                  <Text style={styles.advancedBetText}>Boxcars (30:1)</Text>
                </Pressable>
                <Pressable style={styles.advancedBet} onPress={() => addBet('FIELD')}>
                  <Text style={styles.advancedBetText}>Field</Text>
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
