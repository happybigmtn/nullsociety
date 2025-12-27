/**
 * Nullspace Casino - Mobile App
 * React Native + Expo SDK 54+
 *
 * Jony Ive design principles:
 * - Radical simplicity in every interaction
 * - Progressive disclosure of complexity
 * - 60fps animations, native haptics
 * - On-chain provably fair gaming
 */
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootNavigator } from './src/navigation/RootNavigator';
import { COLORS } from './src/constants/theme';
import { useAppState } from './src/hooks';
import { AuthProvider, WebSocketProvider } from './src/context';

export default function App() {
  // Handle app lifecycle state persistence
  useAppState();

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <AuthProvider>
        <WebSocketProvider>
          <RootNavigator />
        </WebSocketProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
