import type { NotificationResponse } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { api } from '../lib/api';
import { useApp } from '../lib/app-state';
import { Notifications, notificationsAvailable, presentLocal, registerPushToken, routeFor, setupNotifications } from '../lib/notifications';
import { queryClient } from '../lib/query';
import { useShareUpdater } from '../lib/share';
import { secure } from '../lib/storage';
import type { NotificationList } from '../lib/types';

/** De quanto em quanto tempo procura notificações novas com o app aberto. */
export const POLL_MS = 20_000;

/**
 * Busca as notificações novas na API e mostra no aparelho (US17, US18, US25), atualiza o sininho
 * e leva para a tela certa quando o usuário toca na notificação. Também mantém os compartilhamentos
 * de localização atualizados (US29). Não desenha nada.
 */
export function NotificationsBridge() {
  const { user } = useApp();
  const userId = user?.id ?? null;
  useShareUpdater(!!user);

  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    let inFlight = false;
    // Cursor = data da notificação mais nova já vista, sempre vinda do servidor (o relógio do aparelho pode estar errado)
    let cursor: string | null = null;
    const key = `dmr.notif.seen.${userId}`;

    const advance = async (iso: string | undefined) => {
      if (!iso || (cursor && iso <= cursor) || stopped) return;
      cursor = iso;
      await secure.set(key, iso);
    };

    const poll = async () => {
      // Uma busca por vez (intervalo, volta ao primeiro plano e a inicial podem coincidir)
      if (stopped || inFlight || AppState.currentState === 'background') return;
      inFlight = true;
      try {
        let fresh: NotificationList['items'];
        if (cursor) {
          const since = cursor;
          const res = await api.get<NotificationList>(`/me/notifications?since=${encodeURIComponent(since)}&limit=20`);
          if (stopped) return;
          fresh = res.items;
          await advance(res.items[0]?.createdAt);
        } else {
          // Primeira vez nesta conta: mostra as não lidas mais recentes e pega o cursor pela mais nova de todas
          const [unread, newest] = await Promise.all([
            api.get<NotificationList>('/me/notifications?limit=5&unread=true'),
            api.get<NotificationList>('/me/notifications?limit=1'),
          ]);
          if (stopped) return;
          fresh = unread.items;
          await advance(newest.items[0]?.createdAt);
        }
        if (stopped) return;
        for (const n of fresh.slice(0, 3).reverse()) await presentLocal(n);
        if (fresh.length && !stopped) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['me', 'notifications'] }),
            queryClient.invalidateQueries({ queryKey: ['me', 'dashboard'] }),
          ]);
        }
      } catch {
        /* sem conexão: tenta de novo na próxima rodada */
      } finally {
        inFlight = false;
      }
    };

    void (async () => {
      cursor = await secure.get(key);
      if (stopped) return;
      await setupNotifications();
      if (stopped) return;
      void registerPushToken();
      await poll();
    })();
    const timer = setInterval(() => void poll(), POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void poll();
    });
    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
    };
    // Só a troca de conta reinicia (editar o nome não)
  }, [userId]);

  // Toque na notificação → abre a linha, o ponto ou o histórico
  const userRef = useRef(userId);
  useEffect(() => {
    userRef.current = userId;
  });
  useEffect(() => {
    if (Platform.OS === 'web' || !notificationsAvailable) return;
    const open = (r: NotificationResponse | null) => {
      const data = r?.notification.request.content.data as Parameters<typeof routeFor>[0];
      // Sem sessão, o guarda de rotas leva ao login
      if (r && userRef.current) router.navigate(routeFor(data) as never);
    };
    void Notifications.getLastNotificationResponseAsync()
      .then(open)
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);

  return null;
}
