import Constants from 'expo-constants';
// Carrega com segurança: no Expo Go o módulo nativo pode não existir (o app abre mesmo assim).
export let Notifications: typeof import('expo-notifications') = null as never;
export let notificationsAvailable = false;
try {
  Notifications = require('expo-notifications');
  notificationsAvailable = true;
} catch {
  notificationsAvailable = false;
}
import { Platform } from 'react-native';
import { api, request } from './api';
import type { AppNotification } from './types';

/**
 * US17/US18 — notificações do sistema.
 *
 * Sem projeto Firebase configurado, a API não consegue mandar push remoto. O app então busca as notificações
 * novas na API (NotificationsBridge) e as mostra no aparelho como notificação local — funciona com o app aberto
 * ou recém-minimizado. Com FCM/Expo configurados, o token do aparelho é registrado e a API envia push de verdade.
 */
export const CHANNEL_ID = 'alertas';
const native = Platform.OS !== 'web' && notificationsAvailable;

let configured = false;
/** Token de push registrado nesta sessão (removido da API ao sair da conta). */
let registeredToken: string | null = null;

export async function setupNotifications(): Promise<boolean> {
  if (!native) return false;
  try {
    if (!configured) {
      configured = true;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
      });
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: 'Atrasos e alertas de ônibus',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 150, 250],
          lightColor: '#1B4F72',
        });
      }
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Mostra a notificação no aparelho agora. */
export async function presentLocal(n: Pick<AppNotification, 'id' | 'title' | 'body' | 'lineId' | 'stopId' | 'type'>): Promise<void> {
  if (!native) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.title, body: n.body, data: { notificationId: n.id, lineId: n.lineId, stopId: n.stopId, type: n.type } },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
    });
  } catch {
    /* sem permissão: a notificação continua no histórico do app */
  }
}

/** Registra o token de push do aparelho na API, quando o projeto tem push remoto configurado (Expo/FCM). */
export async function registerPushToken(): Promise<string | null> {
  if (!native) return null;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return null;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.put('/me/devices', { token: data, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    registeredToken = data;
    return data;
  } catch {
    // Sem FCM (google-services.json) o Android não gera token: segue só com as notificações locais
    return null;
  }
}

/**
 * Ao sair da conta: o aparelho deixa de receber push desta conta e as notificações já mostradas somem da
 * bandeja (abririam telas da conta anterior). Melhor esforço: nunca impede o logout.
 */
export async function forgetDeviceNotifications(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (token) await request('DELETE', '/me/devices', { token }).catch(() => undefined);
  if (!native) return;
  await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
}

/** Para onde levar o usuário ao tocar na notificação. */
export function routeFor(data: { lineId?: number | null; stopId?: number | null; type?: string } | undefined): string {
  if (!data) return '/notifications';
  if (data.type === 'proximity' && data.lineId && data.stopId) return `/live/${data.lineId}?stopId=${data.stopId}`;
  if (data.type === 'report') return '/notifications';
  if (data.lineId) return `/lines/${data.lineId}`;
  if (data.stopId) return `/stops/${data.stopId}`;
  return '/notifications';
}
