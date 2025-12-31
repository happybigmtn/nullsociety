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
import { registerRootComponent } from 'expo';
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootNavigator } from './src/navigation/RootNavigator';
import { COLORS } from './src/constants/theme';
import { useAppState, useGatewaySession, useWebSocketReconnectOnForeground } from './src/hooks';
import { AuthProvider, WebSocketProvider } from './src/context';

function GatewaySessionBridge({ children }: { children: React.ReactNode }) {
  useGatewaySession();
  useWebSocketReconnectOnForeground();
  return children;
}

function App() {
  // Handle app lifecycle state persistence
  useAppState();

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <AuthProvider>
        <WebSocketProvider>
          <GatewaySessionBridge>
            <RootNavigator />
          </GatewaySessionBridge>
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

// Register the app component - required for Expo to mount on all platforms
registerRootComponent(App);
