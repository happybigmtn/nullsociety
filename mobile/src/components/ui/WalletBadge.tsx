import { View, Text, StyleSheet } from 'react-native';
import { useGameStore } from '../../stores/gameStore';
import { getNetworkLabel } from '../../utils';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';

export function WalletBadge() {
  const publicKey = useGameStore((state) => state.publicKey);
  if (!publicKey) {
    return null;
  }

  const shortKey = `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`;
  const network = getNetworkLabel();

  return (
    <View style={styles.badge}>
      <Text style={styles.network}>{network}</Text>
      <Text style={styles.key}>{shortKey}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  network: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  key: {
    ...TYPOGRAPHY.label,
    color: COLORS.textPrimary,
  },
});

