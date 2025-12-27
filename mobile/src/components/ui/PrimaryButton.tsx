/**
 * Primary action button with haptic feedback and animation
 */
import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { haptics } from '../../services/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../../constants/theme';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'normal' | 'large';
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  size = 'normal',
  style,
}: PrimaryButtonProps) {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.96, ANIMATION.spring);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, ANIMATION.spring);
  };

  const handlePress = async () => {
    if (disabled) return;
    await haptics.betConfirm();
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const variantStyles = {
    primary: { bg: COLORS.primary, text: COLORS.background },
    secondary: { bg: COLORS.surfaceElevated, text: COLORS.textPrimary },
    danger: { bg: COLORS.accent, text: COLORS.textPrimary },
    ghost: { bg: 'transparent', text: COLORS.textMuted },
  };

  const colors = variantStyles[variant];

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[
        styles.button,
        size === 'large' && styles.buttonLarge,
        { backgroundColor: disabled ? COLORS.textDisabled : colors.bg },
        animatedStyle,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text
        style={[
          styles.text,
          size === 'large' && styles.textLarge,
          { color: disabled ? COLORS.textMuted : colors.text },
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: SPACING.sm + 4,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  buttonLarge: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    minWidth: 160,
  },
  text: {
    ...TYPOGRAPHY.label,
    textTransform: 'uppercase',
  },
  textLarge: {
    fontSize: 18,
  },
});
