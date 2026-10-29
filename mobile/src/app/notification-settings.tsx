import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Button, Card, Divider, ErrorNote, Loading, Row, Screen, T, Toggle } from '../components/ui';
import { api, errorText } from '../lib/api';
import { setupNotifications } from '../lib/notifications';
import { queryClient, useApi } from '../lib/query';
import type { NotificationSettings } from '../lib/types';

/** US17 — escolher quais notificações receber. */
export default function NotificationSettingsScreen() {
  const prefs = useApi<NotificationSettings>('/me/notification-settings');
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    void setupNotifications().then(setAllowed);
  }, []);
  const save = useMutation({
    mutationFn: (patch: Partial<NotificationSettings>) => api.patch<NotificationSettings>('/me/notification-settings', patch),
    onMutate: (patch) => {
      const key = ['me', 'notification-settings', '/me/notification-settings'];
      const before = queryClient.getQueryData<NotificationSettings>(key);
      if (before) queryClient.setQueryData(key, { ...before, ...patch });
      return { before, key };
    },
    onError: (_e, _p, c) => c?.before && queryClient.setQueryData(c.key, c.before),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['me', 'notification-settings'] }),
  });
  const p = prefs.data;

  return (
    <Screen title="Preferências de notificação">
      {Platform.OS !== 'web' && allowed === false && (
        <ErrorNote message="As notificações estão bloqueadas para o app. Libere em Configurações do Android → Apps → Mobilidade Urbana → Notificações." />
      )}
      {prefs.isLoading && <Loading />}
      {save.error && <ErrorNote message={errorText(save.error)} />}
      {p && (
        <Card style={{ paddingVertical: 4 }}>
          <Toggle
            icon="clock"
            label="Atrasos nas favoritas"
            subtitle="Quando um ônibus de linha favorita atrasa 5 min ou mais"
            value={p.delays}
            onChange={(v) => save.mutate({ delays: v })}
          />
          <Divider />
          <Toggle
            icon="wrench"
            label="Mudanças de itinerário"
            subtitle="Desvios, obras e suspensões nas favoritas"
            value={p.serviceAlerts}
            onChange={(v) => save.mutate({ serviceAlerts: v })}
          />
          <Divider />
          <Toggle
            icon="target"
            label="Ônibus chegando"
            subtitle="Dos seus alertas de proximidade"
            value={p.proximity}
            onChange={(v) => save.mutate({ proximity: v })}
          />
        </Card>
      )}
      <Card style={{ paddingVertical: 4, marginTop: 14 }}>
        <Row icon="target" title="Alertas de proximidade" subtitle="Escolha a linha, o ponto e com quantos minutos avisar" onPress={() => router.push('/alerts')} />
      </Card>
      <T v="caption" style={{ marginTop: 14 }}>
        Com o app aberto ou minimizado há pouco, os avisos chegam como notificação do celular. Todos ficam guardados no histórico.
      </T>
      <Button title="Ver notificações" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/notifications'))} style={{ marginTop: 8 }} />
    </Screen>
  );
}
