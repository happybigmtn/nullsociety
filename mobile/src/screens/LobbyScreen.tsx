/**
 * Lobby Screen - Jony Ive Redesigned
 * Game selection with balance display and minimal navigation
 */
import { View, Text, StyleSheet, FlatList, Pressable, ListRenderItem } from 'react-native';
import { useCallback, useState } from 'react';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, GAME_COLORS } from '../constants/theme';
import { haptics } from '../services/haptics';
import { useGameStore } from '../stores/gameStore';
import { getBoolean, getNumber, getString, setBoolean, setNumber, setString, STORAGE_KEYS } from '../services/storage';
import type { LobbyScreenProps } from '../navigation/types';
import type { GameId } from '../types';

interface GameInfo {
  id: GameId;
  name: string;
  description: string;
  emoji: string;
  color: string;
}

const GAMES: GameInfo[] = [
  {
    id: 'hi_lo',
    name: 'Hi-Lo',
    description: 'Higher or Lower',
    emoji: '🎲',
    color: GAME_COLORS.hi_lo,
  },
  {
    id: 'blackjack',
    name: 'Blackjack',
    description: 'Beat the dealer',
    emoji: '🃏',
    color: GAME_COLORS.blackjack,
  },
  {
    id: 'roulette',
    name: 'Roulette',
    description: 'Spin the wheel',
    emoji: '🎡',
    color: GAME_COLORS.roulette,
  },
  {
    id: 'craps',
    name: 'Craps',
    description: 'Roll the dice',
    emoji: '🎯',
    color: GAME_COLORS.craps,
  },
  {
    id: 'baccarat',
    name: 'Baccarat',
    description: 'Player or Banker',
    emoji: '👑',
    color: GAME_COLORS.baccarat,
  },
  {
    id: 'casino_war',
    name: 'Casino War',
    description: 'High card wins',
    emoji: '⚔️',
    color: GAME_COLORS.casino_war,
  },
  {
    id: 'video_poker',
    name: 'Video Poker',
    description: 'Jacks or Better',
    emoji: '🎰',
    color: GAME_COLORS.video_poker,
  },
  {
    id: 'sic_bo',
    name: 'Sic Bo',
    description: 'Dice totals',
    emoji: '🀄',
    color: GAME_COLORS.sic_bo,
  },
  {
    id: 'three_card_poker',
    name: '3 Card Poker',
    description: 'Ante & Pair Plus',
    emoji: '🎴',
    color: GAME_COLORS.three_card_poker,
  },
  {
    id: 'ultimate_texas_holdem',
    name: 'Ultimate Holdem',
    description: 'Bet the streets',
    emoji: '🤠',
    color: GAME_COLORS.ultimate_texas_holdem,
  },
];

const parseDateKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export function LobbyScreen({ navigation }: LobbyScreenProps) {
  const { balance, updateBalance } = useGameStore();
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [lastClaim, setLastClaim] = useState(() => getString(STORAGE_KEYS.REWARDS_LAST_CLAIM, ''));
  const [streak, setStreak] = useState(() => getNumber(STORAGE_KEYS.REWARDS_STREAK, 0));
  const [clubJoined, setClubJoined] = useState(() => getBoolean(STORAGE_KEYS.REWARDS_CLUB_JOINED, false));
  const claimedToday = lastClaim === todayKey;

  const handleGameSelect = useCallback((gameId: GameId) => {
    haptics.selectionChange();
    navigation.navigate('Game', { gameId });
  }, [navigation]);

  const handleClaimBonus = useCallback(() => {
    if (claimedToday) return;
    updateBalance(1000);
    const today = new Date();
    const last = lastClaim ? parseDateKey(lastClaim) : null;
    const diffDays = last ? Math.floor((today.getTime() - last.getTime()) / 86400000) : null;
    const nextStreak = diffDays === 1 ? streak + 1 : 1;
    setLastClaim(todayKey);
    setStreak(nextStreak);
    setString(STORAGE_KEYS.REWARDS_LAST_CLAIM, todayKey);
    setNumber(STORAGE_KEYS.REWARDS_STREAK, nextStreak);
  }, [claimedToday, lastClaim, streak, todayKey, updateBalance]);

  const renderGameCard: ListRenderItem<GameInfo> = useCallback(({ item: game, index }) => (
    <Animated.View
      entering={FadeInUp.delay(index * 50)}
      style={styles.gameCardWrapper}
    >
      <Pressable
        onPress={() => handleGameSelect(game.id)}
        style={({ pressed }) => [
          styles.gameCard,
          pressed && styles.gameCardPressed,
        ]}
      >
        <View style={[styles.gameIconContainer, { backgroundColor: game.color + '20' }]}>
          <Text style={styles.gameEmoji}>{game.emoji}</Text>
        </View>
        <Text style={styles.gameName}>{game.name}</Text>
        <Text style={styles.gameDescription}>{game.description}</Text>
      </Pressable>
    </Animated.View>
  ), [handleGameSelect]);

  const ListHeader = useCallback(() => (
    <Text style={styles.sectionTitle}>Games</Text>
  ), []);

  const ListFooter = useCallback(() => (
    <View style={styles.footer}>
      <Text style={styles.footerText}>Provably Fair • On-Chain</Text>
    </View>
  ), []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <Animated.View entering={FadeIn} style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good evening</Text>
          <Text style={styles.balance}>${balance.toLocaleString()}</Text>
        </View>
        <Pressable style={styles.profileButton}>
          <Text style={styles.profileIcon}>👤</Text>
        </Pressable>
      </Animated.View>

      <View style={styles.rewardsCard}>
        <View style={styles.rewardsHeader}>
          <View>
            <Text style={styles.rewardsLabel}>Daily bonus</Text>
            <Text style={styles.rewardsValue}>+1,000 chips</Text>
            <Text style={styles.rewardsSub}>{claimedToday ? 'Claimed today' : 'Ready to claim'}</Text>
          </View>
          <View style={styles.rewardsStreak}>
            <Text style={styles.rewardsStreakLabel}>Streak</Text>
            <Text style={styles.rewardsStreakValue}>{streak}x</Text>
          </View>
        </View>
        <Pressable
          onPress={handleClaimBonus}
          disabled={claimedToday}
          style={({ pressed }) => [
            styles.rewardsButton,
            claimedToday && styles.rewardsButtonDisabled,
            pressed && !claimedToday && styles.rewardsButtonPressed,
          ]}
        >
          <Text style={[styles.rewardsButtonText, claimedToday && styles.rewardsButtonTextDisabled]}>
            {claimedToday ? 'Claimed' : 'Claim now'}
          </Text>
        </Pressable>
        <View style={styles.clubRow}>
          <Text style={styles.clubText}>{clubJoined ? 'Club: Orion Table' : 'Join a club for weekly goals'}</Text>
          {!clubJoined && (
            <Pressable
              onPress={() => {
                setClubJoined(true);
                setBoolean(STORAGE_KEYS.REWARDS_CLUB_JOINED, true);
              }}
              style={styles.clubButton}
            >
              <Text style={styles.clubButtonText}>Join</Text>
            </Pressable>
          )}
          {clubJoined && <Text style={styles.clubJoinedTag}>Joined</Text>}
        </View>
      </View>

      {/* Games Grid */}
      <FlatList
        data={GAMES}
        numColumns={2}
        keyExtractor={(item) => item.id}
        renderItem={renderGameCard}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.gamesContainer}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  greeting: {
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.body,
  },
  balance: {
    color: COLORS.primary,
    ...TYPOGRAPHY.displayLarge,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileIcon: {
    fontSize: 20,
  },
  rewardsCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rewardsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  rewardsLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  rewardsValue: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
  },
  rewardsSub: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  rewardsStreak: {
    alignItems: 'flex-end',
  },
  rewardsStreakLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  rewardsStreakValue: {
    ...TYPOGRAPHY.h2,
    color: COLORS.success,
  },
  rewardsButton: {
    marginTop: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.success,
    alignItems: 'center',
  },
  rewardsButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  rewardsButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  rewardsButtonText: {
    ...TYPOGRAPHY.label,
    color: '#FFFFFF',
  },
  rewardsButtonTextDisabled: {
    color: COLORS.textMuted,
  },
  clubRow: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  clubText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    flex: 1,
  },
  clubButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  clubButtonText: {
    ...TYPOGRAPHY.label,
    color: '#FFFFFF',
  },
  clubJoinedTag: {
    ...TYPOGRAPHY.label,
    color: COLORS.success,
  },
  gamesContainer: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.h2,
    marginBottom: SPACING.md,
    marginLeft: SPACING.xs,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  gameCardWrapper: {
    width: '48%',
  },
  gameCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.xs,
  },
  gameCardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  gameIconContainer: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  gameEmoji: {
    fontSize: 24,
  },
  gameName: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.h3,
    marginBottom: 2,
  },
  gameDescription: {
    color: COLORS.textMuted,
    ...TYPOGRAPHY.caption,
  },
  footer: {
    marginTop: SPACING.xl,
    alignItems: 'center',
  },
  footerText: {
    color: COLORS.textMuted,
    ...TYPOGRAPHY.caption,
  },
});
