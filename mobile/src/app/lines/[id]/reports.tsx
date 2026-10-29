import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '../../../components/Icon';
import { Button, Card, Chip, Empty, ErrorNote, Loading, Screen, T } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../../../lib/app-state';
import { notify } from '../../../lib/dialog';
import { REPORT_CATEGORIES, timeAgo } from '../../../lib/format';
import { queryClient, useApi } from '../../../lib/query';
import { theme } from '../../../lib/theme';
import type { LineReports, Report } from '../../../lib/types';

const iconOf = (c: Report['category']) => REPORT_CATEGORIES.find((x) => x.key === c)?.icon ?? 'dots';

/** US24 — denúncias feitas por outros usuários na linha (anônimas), com "também passei por isso". */
export default function LineReportsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useApp();
  const [days, setDays] = useState(7);
  const data = useApi<LineReports>(`/lines/${id}/reports?days=${days}`);
  const support = useMutation({
    mutationFn: (r: Report) => (r.supportedByMe ? api.del(`/reports/${r.id}/support`) : api.put(`/reports/${r.id}/support`)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['lines', id] }),
    onError: (e) => notify('Não foi possível registrar', errorText(e)),
  });
  const d = data.data;

  return (
    <Screen title={d ? `Denúncias da linha ${d.line.code}` : 'Denúncias'} subtitle={d ? `${d.total} ${d.total === 1 ? 'relato' : 'relatos'} nos últimos ${d.days} dias` : undefined}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        {[7, 30].map((n) => (
          <Chip key={n} label={`${n} dias`} active={days === n} onPress={() => setDays(n)} />
        ))}
      </View>
      {data.isLoading && <Loading />}
      {data.error && !d && <ErrorNote message="Não foi possível carregar as denúncias." onRetry={() => void data.refetch()} />}
      {d && d.total === 0 && <Empty icon="check" title="Nenhuma denúncia recente" text="Ninguém relatou problemas nesta linha no período." />}
      {d && d.summary.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {d.summary.map((s) => (
            <View key={s.category} style={{ backgroundColor: theme.colors.redTint, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
              <T v="label" color={theme.colors.redDeep}>
                {s.label} · {s.people} {s.people === 1 ? 'pessoa' : 'pessoas'}
              </T>
            </View>
          ))}
        </View>
      )}
      {d?.items.map((r) => (
        <Card key={r.id} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.colors.redTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={iconOf(r.category)} size={17} color={theme.colors.redDeep} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="h3">{r.categoryLabel}</T>
              {r.description ? <T v="small">{r.description}</T> : null}
              <T v="caption" style={{ marginTop: 4 }}>
                {r.stop ? `${r.stop.name} · ` : ''}
                {r.people === 1 ? 'relatado por 1 pessoa' : `relatado por ${r.people} pessoas`} · {timeAgo(r.createdAt)}
                {r.mine ? ' · sua denúncia' : ''}
              </T>
              {user && !r.mine && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: r.supportedByMe }}
                  onPress={() => support.mutate(r)}
                  style={{ flexDirection: 'row', gap: 5, alignItems: 'center', marginTop: 8 }}
                >
                  <Icon name={r.supportedByMe ? 'check' : 'plus'} size={15} color={theme.colors.primary} />
                  <T v="label" color={theme.colors.primary}>
                    {r.supportedByMe ? 'Você também relatou' : 'Também passei por isso'}
                  </T>
                </Pressable>
              )}
            </View>
          </View>
        </Card>
      ))}
      {user && <Button title="Fazer uma denúncia" icon="plus" variant="secondary" onPress={() => router.push(`/lines/${id}/report`)} style={{ marginTop: 6 }} />}
      <T v="caption" center style={{ marginTop: 10 }}>
        As denúncias são anônimas: ninguém vê quem relatou.
      </T>
    </Screen>
  );
}
