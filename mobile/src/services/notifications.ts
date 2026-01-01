/**
 * Push notification registration (Expo)
 * Stores Expo push token for backend registration later.
 */
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { getString, setString, STORAGE_KEYS } from './storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function getProjectId(): string | undefined {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
}

const opsBase =
  process.env.EXPO_PUBLIC_OPS_URL ??
  process.env.EXPO_PUBLIC_ANALYTICS_URL ??
  '';

const registerPushToken = async (token: string, publicKey?: string | null) => {
  if (!opsBase) return;
  const endpoint = `${opsBase.replace(/\\/$/, '')}/push/register`;
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        publicKey: publicKey ?? undefined,
        platform: Platform.OS,
        appVersion: process.env.EXPO_PUBLIC_APP_VERSION,
      }),
    });
  } catch {
    // ignore registration errors
  }
};

export async function initializeNotifications(publicKey?: string | null): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      return null;
    }

    const cachedToken = getString(STORAGE_KEYS.PUSH_TOKEN, '');
    if (cachedToken) {
      void registerPushToken(cachedToken, publicKey);
      return cachedToken;
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const request = await Notifications.requestPermissionsAsync();
      status = request.status;
    }

    if (status !== 'granted') {
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId = getProjectId();
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    setString(STORAGE_KEYS.PUSH_TOKEN, token);
    void registerPushToken(token, publicKey);
    return token;
  } catch {
    return null;
  }
}
