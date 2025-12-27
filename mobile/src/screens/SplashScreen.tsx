/**
 * Splash Screen - Jony Ive Redesigned
 * Minimal branding with biometric authentication prompt
 */
import { View, Text, StyleSheet } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { authenticateWithBiometrics, initializeAuth } from '../services/auth';
import { getPublicKey } from '../services/crypto';
import { initializeStorage } from '../services';
import { useAuth } from '../context';
import type { SplashScreenProps } from '../navigation/types';

export function SplashScreen({ navigation }: SplashScreenProps) {
  const pulseOpacity = useSharedValue(0.5);
  const { authenticate } = useAuth();

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );

    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize storage first
      await initializeStorage();

      // Initialize crypto keypair in background (only public key is accessible)
      await getPublicKey();

      // Check if biometrics available and authenticate
      const authResult = await initializeAuth();

      if (authResult.available) {
        const authenticated = await authenticateWithBiometrics();
        if (authenticated) {
          authenticate(); // Mark session as authenticated
          navigation.replace('Lobby');
        } else {
          // Stay on splash, user can retry
          navigation.replace('Auth');
        }
      } else {
        // No biometrics, go to auth screen
        navigation.replace('Auth');
      }
    } catch (error) {
      console.error('Initialization error:', error);
      navigation.replace('Auth');
    }
  };

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View
        entering={FadeIn.duration(800)}
        style={styles.content}
      >
        {/* Logo/Brand */}
        <View style={styles.logoContainer}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>N</Text>
          </View>
          <Text style={styles.brandName}>NULLSPACE</Text>
          <Text style={styles.tagline}>Provably Fair Casino</Text>
        </View>

        {/* Loading indicator */}
        <Animated.View style={[styles.loadingContainer, pulseStyle]}>
          <View style={styles.loadingDot} />
          <View style={styles.loadingDot} />
          <View style={styles.loadingDot} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xl * 2,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  logoText: {
    color: COLORS.background,
    fontSize: 40,
    fontWeight: 'bold',
  },
  brandName: {
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.displayLarge,
    letterSpacing: 4,
  },
  tagline: {
    color: COLORS.textMuted,
    ...TYPOGRAPHY.body,
    marginTop: SPACING.xs,
  },
  loadingContainer: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
});
