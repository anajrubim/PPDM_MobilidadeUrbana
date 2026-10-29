import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '../components/Icon';
import { Button, Chip, Empty, ErrorNote, Loading, Pill, Screen, T } from '../components/ui';
import { api, errorText } from '../lib/api';
import { ask, notify } from '../lib/dialog';
import { dayLabel, minutesLabel } from '../lib/format';
import { formatDistance } from '../lib/geo';
import { queryClient } from '../lib/query';
import { theme } from '../lib/theme';
import type { Trip, TripsPage } from '../lib/types';

type Kind = 'all' | 'completed' | 'planned';
type Period = 7 | 30 | 0;
const PAGE = 20;

/** Data (AAAA-MM-DD) de N dias atrás no fuso da operação. */
function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** US19 — histórico de viagens planejadas e realizadas, com filtro, resumo e paginação. */
export default function History() {
  const [kind, setKind] = useState<Kind>('all');
  const [period, setPeriod] = useState<Period>(30);
  const params = new URLSearchParams({ limit: String(PAGE) });
  if (kind !== 'all') params.set('kind', kind);
  if (period) params.set('from', daysAgo(period - 1));
  const base = `/me/trips?${params.toString()}`;

  const trips = useInfiniteQuery({
    queryKey: ['me', 'trips', 'history', kind, period],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.page<TripsPage['data'], TripsPage['meta']>(`${base}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (last) => last.meta.nextBefore,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['me'] });
  const complete = useMutation({
    mutationFn: (t: Trip) => api.post(`/me/trips/${t.id}/complete`),
    onSuccess: refresh,
    onError: (e) => notify('Não foi possível atualizar', errorText(e)),
  });
  const remove = useMutation({ mutationFn: (t: Trip) => api.del(`/me/trips/${t.id}`), onSuccess: refresh });

  const items = trips.data?.pages.flatMap((p) => p.data) ?? [];
  const summary = trips.data?.pages[0]?.meta.summary;

  return (
    <Screen title="Histórico de viagens">
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {(
          [
            ['all', 'Todas'],
            ['completed', 'Realizadas'],
            ['planned', 'Planejadas'],
          ] as const
        ).map(([k, l]) => (
          <Chip key={k} label={l} active={kind === k} onPress={() => setKind(k)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {(
          [
            [7, '7 dias'],
            [30, '30 dias'],
            [0, 'Tudo'],
          ] as const
        ).map(([p, l]) => (
          <Chip key={p} label={l} icon="clock" active={period === p} onPress={() => setPeriod(p)} />
        ))}
      </View>

      {summary && (
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
          {[
            { v: String(summary.trips), l: 'realizadas' },
            { v: minutesLabel(summary.minutes).replace('agora', '0 min'), l: 'no ônibus' },
            { v: formatDistance(summary.distance), l: 'percorridos' },
            { v: String(summary.planned), l: 'planejadas' },
          ].map((s) => (
            <View key={s.l} style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 10, paddingHorizontal: 8 }}>
              <T v="h3" color={theme.colors.blueDeep} style={{ fontSize: 14 }} numberOfLines={1}>
                {s.v}
              </T>
              <T v="caption" numberOfLines={1}>
                {s.l}
              </T>
            </View>
          ))}
        </View>
      )}

      {trips.isLoading && <Loading />}
      {trips.error && !trips.data && <ErrorNote message="Não foi possível carregar o histórico." onRetry={() => void trips.refetch()} />}
      {trips.data && items.length === 0 && (
        <Empty icon="history" title="Nenhuma viagem neste período" text="Registre uma viagem numa linha ou salve uma opção do planejador." action="Planejar viagem" onAction={() => router.push('/plan')} />
      )}

      {/* Linha do tempo (UI kit) */}
      <View style={{ paddingLeft: 22 }}>
        {items.length > 0 && <View style={{ position: 'absolute', left: 6, top: 6, bottom: 6, width: 1.5, backgroundColor: theme.colors.border }} />}
        {items.map((t) => (
          <View key={t.id} style={{ marginBottom: 18 }}>
            <View
              style={{
                position: 'absolute',
                left: -21,
                top: 3,
                width: 11,
                height: 11,
                borderRadius: 6,
                backgroundColor: t.kind === 'planned' ? theme.colors.surface : theme.colors.primary,
                borderWidth: 2,
                borderColor: theme.colors.primary,
              }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T v="mono" color={theme.colors.textFaint} style={{ fontSize: 11 }}>
                {dayLabel(t.createdAt)}
              </T>
              {t.kind === 'planned' && <Pill label="Planejada" tone="purple" />}
            </View>
            <Pressable accessibilityRole={t.lineId ? 'button' : undefined} disabled={!t.lineId} onPress={() => t.lineId && router.push(`/lines/${t.lineId}`)}>
              <T v="h3" style={{ marginTop: 2 }}>
                {t.originLabel} → {t.destLabel}
              </T>
              <T v="small">
                {t.legs.length > 1 ? 'Linhas' : 'Linha'} {t.lineCode} · {minutesLabel(t.durationMin)} · {formatDistance(t.distanceM)}
                {t.transfers ? ` · ${t.transfers} baldeação` : ''}
              </T>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 14, marginTop: 6 }}>
              {t.kind === 'planned' && (
                <Pressable accessibilityRole="button" accessibilityLabel="Marcar como realizada" onPress={() => complete.mutate(t)} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                  <Icon name="check" size={15} color={theme.colors.green} />
                  <T v="label" color={theme.colors.green}>
                    Fiz esta viagem
                  </T>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Apagar viagem"
                onPress={() =>
                  ask('Apagar viagem?', `${t.originLabel} → ${t.destLabel}`, [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Apagar', style: 'destructive', onPress: () => remove.mutate(t) },
                  ])
                }
                style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}
              >
                <Icon name="trash" size={15} color={theme.colors.textFaint} />
                <T v="label" color={theme.colors.textFaint}>
                  Apagar
                </T>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
      {trips.hasNextPage && (
        <Button title="Carregar mais" variant="ghost" loading={trips.isFetchingNextPage} onPress={() => void trips.fetchNextPage()} />
      )}
    </Screen>
  );
}
