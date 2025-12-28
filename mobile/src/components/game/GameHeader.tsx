/**
 * Game Header with balance, title, and help button
 */
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { HelpButton } from '../ui/HelpButton';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../constants/theme';

interface GameHeaderProps {
  title: string;
  balance: number;
  onHelp?: () => void;
  rightContent?: React.ReactNode;
}

export function GameHeader({ title, balance, onHelp, rightContent }: GameHeaderProps) {
  const navigation = useNavigation();

  return (
    <View style={styles.header}>
      <View style={styles.leftSection}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>{'<'}</Text>
        </Pressable>
        <View style={styles.balanceContainer}>
          <Text style={styles.balanceLabel}>Balance</Text>
          <Text style={styles.balance}>${balance.toLocaleString()}</Text>
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.rightSection}>
        {rightContent}
        {onHelp && <HelpButton onPress={onHelp} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    marginRight: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
  },
  backText: {
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.label,
  },
  balanceContainer: {
    alignItems: 'flex-start',
  },
  balanceLabel: {
    color: COLORS.textMuted,
    ...TYPOGRAPHY.caption,
    textTransform: 'uppercase',
  },
  balance: {
    color: COLORS.primary,
    ...TYPOGRAPHY.h2,
  },
  title: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.label,
    textTransform: 'uppercase',
    letterSpacing: 2,
    flex: 1,
    textAlign: 'center',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
    justifyContent: 'flex-end',
  },
});
