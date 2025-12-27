/**
 * GameLayout - Shared layout component for game screens
 * Provides consistent header, connection status, and content area
 */
import React, { ReactNode } from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { GameHeader } from './GameHeader';
import { ConnectionStatusBanner } from '../ui/ConnectionStatusBanner';
import { COLORS } from '../../constants/theme';
import type { ConnectionState } from '../../services/websocket';

interface ConnectionStatus {
  connectionState: ConnectionState;
  reconnectAttempt: number;
  maxReconnectAttempts: number;
  onRetry?: () => void;
}

interface GameLayoutProps {
  title: string;
  balance: number;
  onHelpPress?: () => void;
  headerRightContent?: ReactNode;
  connectionStatus?: ConnectionStatus;
  children: ReactNode;
}

export function GameLayout({
  title,
  balance,
  onHelpPress,
  headerRightContent,
  connectionStatus,
  children,
}: GameLayoutProps) {
  return (
    <SafeAreaView style={styles.container}>
      {connectionStatus && (
        <ConnectionStatusBanner
          connectionState={connectionStatus.connectionState}
          reconnectAttempt={connectionStatus.reconnectAttempt}
          maxReconnectAttempts={connectionStatus.maxReconnectAttempts}
          onRetry={connectionStatus.onRetry}
        />
      )}
      <GameHeader
        title={title}
        balance={balance}
        onHelp={onHelpPress}
        rightContent={headerRightContent}
      />
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
  },
});
