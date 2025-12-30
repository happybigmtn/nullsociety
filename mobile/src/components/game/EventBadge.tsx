import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../../constants/theme';
import { formatCountdownShort, useWeeklyEvent } from '../../hooks/useWeeklyEvent';

export function EventBadge() {
  const { event, timeLeftMs } = useWeeklyEvent();

  if (!event) return null;

  return (
    <View style={[styles.container, { borderColor: event.color + '33', backgroundColor: event.color + '14' }]}>
      <Text style={[styles.label, { color: event.color }]}>Event</Text>
      <Text style={[styles.title, { color: event.color }]}>{event.label}</Text>
      <Text style={styles.timer}>Ends in {formatCountdownShort(timeLeftMs)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
  },
  timer: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
});
