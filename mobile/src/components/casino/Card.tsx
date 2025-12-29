/**
 * Playing card component with flip animation
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { haptics } from '../../services/haptics';
import { COLORS, RADIUS, ANIMATION, SPRING } from '../../constants/theme';
import type { Suit, Rank } from '../../types';

interface CardProps {
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
  size?: 'small' | 'normal' | 'large';
  onFlipComplete?: () => void;
}

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const SUIT_COLORS: Record<Suit, string> = {
  hearts: COLORS.suitRed,
  diamonds: COLORS.suitRed,
  clubs: COLORS.suitBlack,
  spades: COLORS.suitBlack,
};

const SIZE_STYLES = {
  small: { width: 56, height: 84 },
  normal: { width: 80, height: 120 },
  large: { width: 100, height: 150 },
} as const;

interface CardFaceProps {
  suit: Suit;
  rank: Rank;
  size: 'small' | 'normal' | 'large';
}

const CardFace = React.memo(function CardFace({ suit, rank, size }: CardFaceProps) {
  const sizeMultiplier = size === 'small' ? 0.7 : size === 'large' ? 1.3 : 1;
  const color = SUIT_COLORS[suit];

  return (
    <View style={[styles.cardFace, { backgroundColor: '#FFFFFF' }]}>
      <Text
        style={[
          styles.rank,
          { color, fontSize: 24 * sizeMultiplier },
        ]}
      >
        {rank}
      </Text>
      <Text
        style={[
          styles.suit,
          { color, fontSize: 32 * sizeMultiplier },
        ]}
      >
        {SUIT_SYMBOLS[suit]}
      </Text>
    </View>
  );
});

const CardBack = React.memo(function CardBack() {
  return (
    <View style={[styles.cardFace, styles.cardBack]}>
      <View style={styles.backPattern} />
    </View>
  );
});

export function Card({
  suit,
  rank,
  faceUp,
  size = 'normal',
  onFlipComplete,
}: CardProps) {
  const flip = useSharedValue(faceUp ? 180 : 0);

  // Use ref to avoid re-triggering effect when callback identity changes
  const onFlipCompleteRef = useRef(onFlipComplete);
  onFlipCompleteRef.current = onFlipComplete;

  useEffect(() => {
    flip.value = withSpring(
      faceUp ? 180 : 0,
      SPRING.cardFlip,
      (finished) => {
        'worklet';
        if (finished && faceUp) {
          runOnJS(haptics.cardDeal)();
          runOnJS(() => {
            onFlipCompleteRef.current?.();
          })();
        }
      }
    );
  }, [faceUp]); // flip is SharedValue (stable ref), onFlipComplete uses ref pattern

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${flip.value}deg` },
    ],
    backfaceVisibility: 'hidden',
    opacity: flip.value > 90 ? 1 : 0,
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${flip.value - 180}deg` },
    ],
    backfaceVisibility: 'hidden',
    position: 'absolute',
    opacity: flip.value < 90 ? 1 : 0,
  }));

  const cardSize = SIZE_STYLES[size];

  return (
    <View style={[styles.cardContainer, cardSize]}>
      <Animated.View style={[styles.card, cardSize, frontStyle]}>
        <CardFace suit={suit} rank={rank} size={size} />
      </Animated.View>
      <Animated.View style={[styles.card, cardSize, backStyle]}>
        <CardBack />
      </Animated.View>
    </View>
  );
}

/**
 * Hidden card placeholder
 */
export function HiddenCard({ size = 'normal' }: { size?: 'small' | 'normal' | 'large' }) {
  return (
    <View style={[styles.card, SIZE_STYLES[size]]}>
      <CardBack />
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    position: 'relative',
  },
  card: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  cardFace: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  cardBack: {
    backgroundColor: '#1E40AF',
  },
  backPattern: {
    width: '80%',
    height: '80%',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
  },
  rank: {
    fontWeight: 'bold',
  },
  suit: {
    marginTop: -4,
  },
});
