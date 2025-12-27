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
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    padding: SPACING.xs,
    marginRight: SPACING.sm,
  },
  backText: {
    color: COLORS.textSecondary,
    fontSize: 24,
    fontWeight: 'bold',
  },
  balanceContainer: {
    alignItems: 'flex-start',
  },
  balanceLabel: {
    color: COLORS.textMuted,
    ...TYPOGRAPHY.caption,
  },
  balance: {
    color: COLORS.primary,
    ...TYPOGRAPHY.displayMedium,
  },
  title: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.h3,
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
