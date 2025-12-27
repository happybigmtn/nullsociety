/**
 * Centralized haptic feedback service
 * Provides consistent tactile response across all game interactions
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export class HapticsService {
  private enabled = true;
  private abortController: AbortController | null = null;

  /**
   * Check if haptics can be triggered
   */
  private canVibrate(): boolean {
    return this.enabled && Platform.OS !== 'web';
  }

  /**
   * Schedule a haptic with abort support for cleanup
   */
  private scheduleHaptic(
    fn: () => Promise<void>,
    delayMs: number,
    signal: AbortSignal
  ): void {
    const timeoutId = setTimeout(() => {
      if (!signal.aborted) {
        fn().catch(() => {
          // Haptic failure is non-critical, silently ignore
        });
      }
    }, delayMs);

    signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });
  }

  /**
   * Light haptic for chip selection/placement
   */
  async chipPlace(): Promise<void> {
    if (!this.canVibrate()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  /**
   * Medium haptic for bet confirmation
   */
  async betConfirm(): Promise<void> {
    if (!this.canVibrate()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  /**
   * Light haptic for card deals
   */
  async cardDeal(): Promise<void> {
    if (!this.canVibrate()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  /**
   * Light haptic for dice roll
   */
  async diceRoll(): Promise<void> {
    if (!this.canVibrate()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  /**
   * Light haptic for wheel spin
   */
  async wheelSpin(): Promise<void> {
    if (!this.canVibrate()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  /**
   * Success notification for wins
   */
  async win(): Promise<void> {
    if (!this.canVibrate()) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  /**
   * Error notification for losses
   */
  async loss(): Promise<void> {
    if (!this.canVibrate()) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  /**
   * Error notification for invalid actions (e.g., insufficient balance)
   */
  async error(): Promise<void> {
    if (!this.canVibrate()) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  /**
   * Celebratory pattern for jackpots
   */
  async jackpot(): Promise<void> {
    if (!this.canVibrate()) return;

    // Cancel any in-flight pattern
    this.abortController?.abort();
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    // Celebratory pattern
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    this.scheduleHaptic(
      () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
      100,
      signal
    );
    this.scheduleHaptic(
      () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      200,
      signal
    );
  }

  /**
   * Warning haptic for push/tie results
   */
  async push(): Promise<void> {
    if (!this.canVibrate()) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }

  /**
   * Button press feedback
   */
  async buttonPress(): Promise<void> {
    if (!this.canVibrate()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  /**
   * Selection change feedback
   */
  async selectionChange(): Promise<void> {
    if (!this.canVibrate()) return;
    await Haptics.selectionAsync();
  }

  /**
   * Enable or disable haptics
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if haptics are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Cleanup pending haptics (call on unmount)
   */
  cleanup(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}

export const haptics = new HapticsService();
