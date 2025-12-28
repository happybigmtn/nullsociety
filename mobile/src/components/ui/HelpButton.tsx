/**
 * Help button component for accessing game tutorials
 */
import { Pressable, Text, StyleSheet } from 'react-native';
import { haptics } from '../../services/haptics';
import { COLORS, SPACING, RADIUS } from '../../constants/theme';

interface HelpButtonProps {
  onPress: () => void;
}

export function HelpButton({ onPress }: HelpButtonProps) {
  const handlePress = async () => {
    await haptics.buttonPress();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Help"
      accessibilityHint="Opens game tutorial"
    >
      <Text style={styles.text}>?</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: COLORS.surface,
  },
  text: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});
