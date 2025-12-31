/**
 * Tutorial overlay component for progressive disclosure of game rules
 */
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { useState, useEffect } from 'react';
import Animated, { FadeOut, SlideInDown } from 'react-native-reanimated';
import { haptics } from '../../services/haptics';
import { isTutorialCompleted, markTutorialCompleted } from '../../services/storage';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../constants/theme';
import type { TutorialStep } from '../../types';

interface TutorialOverlayProps {
  gameId: string;
  steps: TutorialStep[];
  onComplete: () => void;
  forceShow?: boolean;
}

export function TutorialOverlay({
  gameId,
  steps,
  onComplete,
  forceShow = false,
}: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check if tutorial was already completed
    if (forceShow) {
      setVisible(true);
    } else {
      const completed = isTutorialCompleted(gameId);
      setVisible(!completed);
    }
  }, [gameId, forceShow]);

  const handleNext = async () => {
    await haptics.buttonPress();
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    markTutorialCompleted(gameId);
    setVisible(false);
    onComplete();
  };

  const handleSkip = async () => {
    await haptics.buttonPress();
    markTutorialCompleted(gameId);
    setVisible(false);
    onComplete();
  };

  if (!visible || steps.length === 0) return null;

  const step = steps[currentStep];
  if (!step) return null;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View
          entering={SlideInDown.duration(300)}
          exiting={FadeOut.duration(200)}
          style={styles.card}
        >
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.description}>{step.description}</Text>

          <View style={styles.progress}>
            {steps.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === currentStep && styles.dotActive,
                  i < currentStep && styles.dotComplete,
                ]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable onPress={handleSkip} style={styles.skipButton}>
              <Text style={styles.skipText}>Skip tutorial</Text>
            </Pressable>
            <Pressable onPress={handleNext} style={styles.nextButton}>
              <Text style={styles.nextText}>
                {currentStep === steps.length - 1 ? 'GOT IT' : 'NEXT'}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
    padding: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.sm,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  description: {
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.bodySmall,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  progress: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    backgroundColor: COLORS.primary,
    width: 24,
  },
  dotComplete: {
    backgroundColor: COLORS.primary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipButton: {
    padding: SPACING.sm,
  },
  skipText: {
    color: COLORS.textMuted,
    ...TYPOGRAPHY.bodySmall,
    textTransform: 'uppercase',
  },
  nextButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  nextText: {
    color: COLORS.background,
    ...TYPOGRAPHY.label,
  },
});
