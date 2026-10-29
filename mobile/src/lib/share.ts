import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { Platform, Share } from 'react-native';
import { api } from './api';
import { useGlobalApi } from './query';
import type { LocationShare } from './types';

/** Com compartilhamento ativo, envia a posição no máximo a cada 30 s (economiza bateria e dados). */
export const SHARE_UPDATE_MS = 30_000;

export function shareMessage(s: LocationShare, name: string): string {
  const first = name.split(' ')[0] ?? name;
  const route = s.route
    ? ` Estou no ônibus ${s.route.line.code}${s.route.dest ? ` indo para ${s.route.dest.name}` : ''}${s.route.eta ? `, chegada prevista às ${s.route.eta}` : ''}.`
    : '';
  return `${first} está compartilhando a localização com você pelo Mobilidade Urbana.${route} Acompanhe: ${s.url}`;
}

/** Abre a folha de compartilhamento do sistema (WhatsApp, SMS, e-mail...). Na web, copia o link. */
export async function openShareSheet(s: LocationShare, name: string): Promise<'shared' | 'copied' | 'dismissed'> {
  const message = shareMessage(s, name);
  if (Platform.OS === 'web') {
    const nav = (globalThis as { navigator?: { share?: (d: object) => Promise<void>; clipboard?: { writeText: (t: string) => Promise<void> } } }).navigator;
    if (nav?.share) {
      try {
        await nav.share({ title: 'Minha localização', text: message, url: s.url });
        return 'shared';
      } catch {
        /* cancelado: tenta copiar */
      }
    }
    await nav?.clipboard?.writeText(message).catch(() => undefined);
    return 'copied';
  }
  const r = await Share.share({ message, title: 'Minha localização' });
  return r.action === Share.dismissedAction ? 'dismissed' : 'shared';
}

/** Mantém a posição dos compartilhamentos ativos atualizada enquanto o app está aberto. */
export function useShareUpdater(enabled: boolean) {
  const shares = useGlobalApi<LocationShare[]>(enabled ? '/me/shares' : null, { refetchInterval: 60_000 });
  const active = (shares.data ?? []).filter((s) => s.active && new Date(s.expiresAt) > new Date());
  const ids = active.map((s) => s.id).join(',');
  const last = useRef(0);

  useEffect(() => {
    if (!ids) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted || cancelled) return;
        const s = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: SHARE_UPDATE_MS, distanceInterval: 25, mayShowUserSettingsDialog: false },
          (p) => {
            const now = Date.now();
            if (now - last.current < SHARE_UPDATE_MS - 1000) return;
            last.current = now;
            for (const id of ids.split(',')) {
              void api
                .put(`/me/shares/${id}/position`, { lat: p.coords.latitude, lng: p.coords.longitude })
                .catch(() => undefined);
            }
          },
        );
        // A tela saiu enquanto o GPS ligava: desliga já (senão ficaria ligado até fechar o app)
        if (cancelled) s.remove();
        else sub = s;
      } catch {
        /* sem GPS: o contato vê a última posição enviada */
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [ids]);
}
