import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon, type IconName } from '../components/Icon';
import { Button, Card, Empty, ErrorNote, Loading, Screen, Segment, T } from '../components/ui';
import { api, errorText } from '../lib/api';
import { ask, notify } from '../lib/dialog';
import { timeAgo } from '../lib/format';
import { routeFor } from '../lib/notifications';
import { queryClient, useApi } from '../lib/query';
import { theme } from '../lib/theme';
import type { AppNotification, NotificationList, NotificationType } from '../lib/types';

const LOOK: Record<NotificationType, { icon: IconName; bg: string; fg: string }> = {
  delay: { icon: 'clock', bg: theme.colors.amberTint, fg: theme.colors.amberDeep },
  service_alert: { icon: 'wrench', bg: theme.colors.redTint, fg: theme.colors.redDeep },
  proximity: { icon: 'target', bg: theme.colors.purpleTint, fg: theme.colors.purple },
  report: { icon: 'check', bg: theme.colors.greenTint, fg: theme.colors.greenDeep },
  share: { icon: 'share', bg: theme.colors.tint, fg: theme.colors.primary },
  system: { icon: 'bell', bg: theme.colors.tint, fg: theme.colors.primary },
};

const PAGE = 30;

/** US17/US18/US25 — alertas recebidos; US20 — histórico de notificações. */
export default function Notifications() {
  const [tab, setTab] = useState<'new' | 'all'>('new');
  const unread = useApi<NotificationList>('/me/notifications?unread=true&limit=100', { refetchInterval: 20_000 });
  const history = useInfiniteQuery({
    queryKey: ['me', 'notifications', 'history'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<NotificationList>(`/me/notifications?limit=${PAGE}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (last) => (last.items.length === PAGE ? last.items.at(-1)!.createdAt : null),
    enabled: tab === 'all',
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['me'] });
  const markRead = useMutation({
    mutationFn: (body: { ids?: string[]; all?: boolean }) => api.post('/me/notifications/read', body),
    onSettled: refresh,
  });
  const clear = useMutation({
    mutationFn: () => api.del('/me/notifications'),
    onSuccess: refresh,
    onError: (e) => notify('Não foi possível limpar', errorText(e)),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/me/notifications/${id}`), onSettled: refresh });

  const open = (n: AppNotification) => {
    if (!n.read) markRead.mutate({ ids: [n.id] });
    const to = routeFor({ lineId: n.lineId, stopId: n.stopId, type: n.type });
    // Já está nesta tela: não empilha outra cópia
    if (to !== '/notifications') router.push(to as never);
  };

  const items = tab === 'new' ? (unread.data?.items ?? []) : (history.data?.pages.flatMap((p) => p.items) ?? []);
  const loading = tab === 'new' ? unread.isLoading : history.isLoading;
  const error = tab === 'new' ? unread.error && !unread.data : history.error && !history.data;

  return (
    <Screen
      title="Notificações"
      subtitle={unread.data ? (unread.data.unread ? `${unread.data.unread} não lidas` : 'Tudo em dia') : undefined}
      right={
        <Pressable accessibilityRole="button" accessibilityLabel="Preferências de notificação" hitSlop={10} onPress={() => router.push('/notification-settings')}>
          <Icon name="gear" size={22} color={theme.colors.textSoft} />
        </Pressable>
      }
    >
      <Segment
        options={[
          { key: 'new', label: `Alertas${unread.data?.unread ? ` (${unread.data.unread})` : ''}` },
          { key: 'all', label: 'Histórico' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {loading && <Loading />}
      {error && <ErrorNote message="Não foi possível carregar as notificações." onRetry={() => void (tab === 'new' ? unread.refetch() : history.refetch())} />}
      {!loading && !error && items.length === 0 && (
        <Empty
          icon="bell"
          title={tab === 'new' ? 'Nenhum alerta novo' : 'Nenhuma notificação'}
          text="Atrasos e mudanças nas suas linhas favoritas, ônibus chegando nos seus alertas e confirmações de denúncia aparecem aqui."
          action="Criar alerta de proximidade"
          onAction={() => router.push('/alerts')}
        />
      )}
      {items.length > 0 && (
        <Card style={{ paddingVertical: 2 }}>
          {items.map((n, i) => {
            const look = LOOK[n.type] ?? LOOK.system;
            return (
              <Pressable
                key={n.id}
                accessibilityRole="button"
                accessibilityLabel={`${n.read ? '' : 'Não lida. '}${n.title}. ${n.body}`}
                onPress={() => open(n)}
                onLongPress={() =>
                  ask('Apagar notificação?', n.title, [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Apagar', style: 'destructive', onPress: () => remove.mutate(n.id) },
                  ])
                }
                style={{ flexDirection: 'row', gap: 12, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: theme.colors.border }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: look.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={look.icon} size={17} color={look.fg} />
                </View>
                <View style={{ flex: 1 }}>
                  <T v="h3" style={{ fontSize: 13.5, fontFamily: n.read ? theme.font.semibold : theme.font.bold }}>
                    {n.title}
                  </T>
                  <T v="small">{n.body}</T>
                  <T v="caption" style={{ marginTop: 3 }}>
                    {timeAgo(n.createdAt)}
                  </T>
                </View>
                {!n.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary, marginTop: 6 }} />}
              </Pressable>
            );
          })}
        </Card>
      )}
      {tab === 'all' && history.hasNextPage && (
        <Button title="Carregar mais" variant="ghost" loading={history.isFetchingNextPage} onPress={() => void history.fetchNextPage()} style={{ marginTop: 8 }} />
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        {tab === 'new' && !!unread.data?.unread && (
          <Button title="Marcar todas como lidas" icon="check" variant="secondary" onPress={() => markRead.mutate({ all: true })} style={{ flex: 1 }} />
        )}
        {tab === 'all' && items.length > 0 && (
          <Button
            title="Limpar histórico"
            icon="trash"
            variant="ghost"
            onPress={() =>
              ask('Limpar o histórico?', 'Todas as notificações serão apagadas.', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Limpar', style: 'destructive', onPress: () => clear.mutate() },
              ])
            }
            style={{ flex: 1 }}
          />
        )}
      </View>
      <Button title="Meus alertas de proximidade" icon="target" variant="ghost" onPress={() => router.push('/alerts')} style={{ marginTop: 4 }} />
      <T v="caption" center style={{ marginTop: 6 }}>
        Toque para abrir · segure para apagar
      </T>
    </Screen>
  );
}
