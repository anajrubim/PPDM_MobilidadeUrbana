import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, Switch, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { Button, Card, Empty, ErrorNote, LineBadge, Loading, Screen, T } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { ask, notify } from '../../lib/dialog';
import { etaLabel } from '../../lib/format';
import { queryClient, useApi } from '../../lib/query';
import { theme } from '../../lib/theme';
import type { ProximityAlert } from '../../lib/types';

/** US18 — meus alertas de proximidade (ônibus a N minutos do ponto). */
export default function Alerts() {
  const alerts = useApi<ProximityAlert[]>('/me/alerts', { refetchInterval: 60_000 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['me', 'alerts'] });
  const toggle = useMutation({
    mutationFn: (a: ProximityAlert) => api.patch(`/me/alerts/${a.id}`, { active: !a.active }),
    onSettled: refresh,
    onError: (e) => notify('Não foi possível alterar o alerta', errorText(e)),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/me/alerts/${id}`), onSettled: refresh });

  return (
    <Screen title="Alertas de proximidade" subtitle="Aviso quando o ônibus estiver chegando">
      {alerts.isLoading && <Loading />}
      {alerts.error && !alerts.data && <ErrorNote message="Não foi possível carregar os alertas." onRetry={() => void alerts.refetch()} />}
      {alerts.data?.length === 0 && (
        <Empty icon="target" title="Nenhum alerta ainda" text="Escolha uma linha e o ponto onde você embarca: avisamos alguns minutos antes de o ônibus chegar." />
      )}
      {alerts.data?.map((a) => (
        <Card key={a.id} style={{ marginBottom: 10, opacity: a.active ? 1 : 0.65 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <LineBadge code={a.line.code} color={a.line.color} />
            <Pressable accessibilityRole="button" accessibilityLabel={`Acompanhar a linha ${a.line.code}`} style={{ flex: 1 }} onPress={() => router.push(`/live/${a.line.id}?stopId=${a.stop.id}`)}>
              <T v="h3" numberOfLines={1}>
                {a.stop.name}
              </T>
              <T v="small">
                Avisa {a.minutesBefore} min antes{a.windowStart ? ` · ${a.windowStart}–${a.windowEnd}` : ' · o dia todo'}
              </T>
              {a.nextArrival && (
                <T v="caption">
                  Próximo: {a.nextArrival.at} ({etaLabel(a.nextArrival.inMin)})
                </T>
              )}
            </Pressable>
            <Switch
              accessibilityLabel={`${a.active ? 'Desativar' : 'Ativar'} alerta da linha ${a.line.code} em ${a.stop.name}`}
              value={a.active}
              onValueChange={() => toggle.mutate(a)}
              trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
              thumbColor="#fff"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Apagar alerta"
              hitSlop={8}
              onPress={() =>
                ask('Apagar alerta?', `${a.line.code} em ${a.stop.name}`, [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Apagar', style: 'destructive', onPress: () => remove.mutate(a.id) },
                ])
              }
            >
              <Icon name="trash" size={18} color={theme.colors.textFaint} />
            </Pressable>
          </View>
        </Card>
      ))}
      <Button title="Novo alerta" icon="plus" onPress={() => router.push('/alerts/new')} style={{ marginTop: 6 }} />
    </Screen>
  );
}
