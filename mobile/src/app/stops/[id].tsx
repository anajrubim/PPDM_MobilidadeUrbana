import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { TransitMap } from '../../components/map';
import { AlertBanner, Button, Card, ErrorNote, LineBadge, Loading, Pill, Screen, T } from '../../components/ui';
import { useApp } from '../../lib/app-state';
import { etaLabel, SERVICE_LABEL, uniqueAlerts } from '../../lib/format';
import { useOnline } from '../../lib/network';
import { minutesOfDay, offlineArrivals } from '../../lib/schedule';
import { useNow } from '../../lib/use-now';
import { distanceM, formatDistance, toLatLng } from '../../lib/geo';
import { useCurrentLocation } from '../../lib/location';
import { useApi } from '../../lib/query';
import { theme } from '../../lib/theme';
import type { StopDetail } from '../../lib/types';

/**
 * US09 — linhas que passam na parada e horários previstos (próximos e tabela do dia).
 * Sprint 2: previsão com atraso (US16), avisos (US17), alerta de chegada (US18), como chegar (US15), offline (US27).
 */
export default function StopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useApp();
  const online = useOnline();
  const stop = useApi<StopDetail>(`/stops/${id}`, { refetchInterval: 30_000 });
  const { position } = useCurrentLocation();
  const [open, setOpen] = useState<number | null>(null);
  const now = useNow();
  const s = stop.data;
  const here = useMemo(() => (s ? toLatLng(s) : null), [s]);
  const points = useMemo(() => (s && here ? [{ id: 'stop', coord: here, kind: 'highlight' as const, label: s.name }] : []), [s, here]);

  if (!s || !here)
    return <Screen title="Ponto de parada">{stop.isLoading ? <Loading /> : <ErrorNote message="Ponto não encontrado." />}</Screen>;

  const away = position ? distanceM(position, here) : null;
  // US27 — sem internet (ou dado salvo há mais de 5 min), calcula os próximos horários no aparelho
  const stale = !online || (stop.savedAt != null && now - stop.savedAt > 5 * 60_000);
  const nowMin = minutesOfDay(new Date(now));

  return (
    <Screen title={s.name} subtitle={`Ponto ${s.code}${away != null ? ` · a ${formatDistance(away)} de você` : ''}`}>
      <TransitMap height={170} user={position} points={points} fitTo={[here]} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Button title="Como chegar aqui" icon="route" variant="secondary" onPress={() => router.push(`/plan?toStopId=${s.id}`)} style={{ flex: 1 }} />
      </View>
      {stale && (
        <T v="caption" style={{ marginTop: 8 }}>
          {online ? 'Não deu para atualizar agora' : 'Sem internet'}: horários calculados no aparelho pela programação (sem atrasos).
        </T>
      )}
      <T v="label" style={{ marginTop: 18, marginBottom: 8 }}>
        {s.lines.length} {s.lines.length === 1 ? 'linha passa' : 'linhas passam'} aqui
      </T>
      {s.lines.length === 0 && <T v="small">Nenhuma linha ativa neste ponto.</T>}
      {s.lines.map((l) => {
        const arrivals = stale ? offlineArrivals(l, l.offsets ?? [], nowMin, 3) : l.arrivals;
        const [first, ...rest] = arrivals;
        const expanded = open === l.id;
        return (
          <Card key={l.id} style={{ marginBottom: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Linha ${l.code}: próximo ${first ? `às ${first.at}` : 'sem previsão'}. Toque para ver todos os horários`}
              onPress={() => setOpen(expanded ? null : l.id)}
              style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}
            >
              <LineBadge code={l.code} color={l.color} />
              <View style={{ flex: 1 }}>
                <T v="h3" numberOfLines={1}>
                  {l.name}
                </T>
                <T v="small">
                  {rest.length
                    ? `Depois: ${rest.map((a) => a.at).join(' · ')}`
                    : `Primeiro ${l.firstDeparture} · último ${l.lastDeparture}`}
                </T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T v="h3" color={first && first.inMin <= 3 ? theme.colors.green : theme.colors.primary}>
                  {etaLabel(first?.inMin)}
                </T>
                {first && (
                  <T v="caption" color={first.live && (first.delayMin ?? 0) >= 5 ? theme.colors.amberDeep : undefined}>
                    {first.live ? '● ' : ''}às {first.at}
                    {first.live && first.delayMin ? ` (+${first.delayMin})` : ''}
                  </T>
                )}
              </View>
              <Icon name={expanded ? 'chevrondown' : 'chevron'} size={18} color={theme.colors.textFaint} />
            </Pressable>
            {uniqueAlerts(l.alerts).map((a) => (
              <View key={a.id} style={{ marginTop: 10 }}>
                <AlertBanner kind={a.kind} title={a.title} message={a.message} />
              </View>
            ))}
            {expanded && (
              <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 10 }}>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  <Pill label={SERVICE_LABEL[l.serviceType]} tone={l.serviceType === 'normal' ? 'blue' : 'purple'} />
                  <Pill label={`a cada ${l.headwayMin} min`} tone="green" />
                </View>
                <T v="label" style={{ marginBottom: 6 }}>
                  Horários previstos neste ponto ({l.timetable.length})
                </T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {l.timetable.map((h) => (
                    <View key={h} style={{ backgroundColor: theme.colors.tint, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
                      <T v="mono" color={theme.colors.primary}>
                        {h}
                      </T>
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  <Button title="Ao vivo" icon="bus" onPress={() => router.push(`/live/${l.id}?stopId=${s.id}`)} style={{ flexGrow: 1 }} />
                  {user && (
                    <Button title="Avisar chegada" icon="bell" variant="secondary" onPress={() => router.push(`/alerts/new?lineId=${l.id}&stopId=${s.id}`)} style={{ flexGrow: 1 }} />
                  )}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                  <Pressable accessibilityRole="link" onPress={() => router.push(`/lines/${l.id}`)}>
                    <T v="label" color={theme.colors.primary}>
                      Ver trajeto da linha {l.code} →
                    </T>
                  </Pressable>
                  {user && (
                    <Pressable accessibilityRole="link" onPress={() => router.push(`/lines/${l.id}/report?stopId=${s.id}`)}>
                      <T v="label" color={theme.colors.red}>
                        Denunciar problema
                      </T>
                    </Pressable>
                  )}
                </View>
              </View>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
