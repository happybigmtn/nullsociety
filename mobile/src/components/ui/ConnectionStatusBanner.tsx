/**
 * ConnectionStatusBanner - Shows connection status with reconnection feedback
 * Displays when disconnected or reconnecting, hidden when connected
 */
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../constants/theme';
import type { ConnectionState } from '../../services/websocket';

interface ConnectionStatusBannerProps {
  connectionState: ConnectionState;
  reconnectAttempt: number;
  maxReconnectAttempts: number;
  onRetry?: () => void;
}

export function ConnectionStatusBanner({
  connectionState,
  reconnectAttempt,
  maxReconnectAttempts,
  onRetry,
}: ConnectionStatusBannerProps) {
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (connectionState === 'connecting') {
      pulseOpacity.value = withRepeat(
        withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulseOpacity.value = 1;
    }
  }, [connectionState]); // pulseOpacity is a SharedValue (stable ref) - must not be in deps

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  // Don't show banner when connected
  if (connectionState === 'connected') {
    return null;
  }

  const isFailed = connectionState === 'failed';
  const isConnecting = connectionState === 'connecting';

  const getMessage = (): string => {
    if (isFailed) {
      return 'Connection failed';
    }
    if (isConnecting) {
      if (reconnectAttempt > 0) {
        return `Reconnecting... (${reconnectAttempt}/${maxReconnectAttempts})`;
      }
      return 'Connecting...';
    }
    // disconnected
    if (reconnectAttempt > 0) {
      return `Reconnecting... (${reconnectAttempt}/${maxReconnectAttempts})`;
    }
    return 'Disconnected';
  };

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={[styles.container, isFailed && styles.containerFailed]}
    >
      <View style={styles.content}>
        {isConnecting && (
          <Animated.View style={[styles.indicator, pulseStyle]} />
        )}
        {!isConnecting && <View style={[styles.indicator, styles.indicatorStatic]} />}
        <Text style={styles.message}>{getMessage()}</Text>
      </View>
      {isFailed && onRetry && (
        <Pressable onPress={onRetry} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.warning,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  containerFailed: {
    backgroundColor: COLORS.error,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.textPrimary,
  },
  indicatorStatic: {
    opacity: 0.6,
  },
  message: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '500',
  },
  retryButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: RADIUS.sm,
  },
  retryText: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
  },
});
