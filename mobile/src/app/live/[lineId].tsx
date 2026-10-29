import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { TransitMap, type MapPoint } from '../../components/map';
import { AlertBanner, Button, Card, Chip, ErrorNote, LineBadge, Loading, Pill, Screen, T } from '../../components/ui';
import { countdown, delayLabel, etaLabel, uniqueAlerts } from '../../lib/format';
import { toLatLng } from '../../lib/geo';
import { useCurrentLocation } from '../../lib/location';
import { useOnline } from '../../lib/network';
import { useApi } from '../../lib/query';
import { theme } from '../../lib/theme';
import { useNow } from '../../lib/use-now';
import type { LineDetail, LiveLine } from '../../lib/types';

/** De quanto em quanto tempo a posição dos ônibus é atualizada. */
export const LIVE_REFRESH_MS = 5_000;

/** US16 — acompanhar os ônibus da linha em tempo real e quanto falta para chegar no ponto escolhido. */
export default function LiveBus() {
  const { lineId, stopId: stopParam } = useLocalSearchParams<{ lineId: string; stopId?: string }>();
  const online = useOnline();
  const { position } = useCurrentLocation({ watch: true });
  const line = useApi<LineDetail>(`/lines/${lineId}`);
  const [picked, setStopId] = useState<number | null>(stopParam ? Number(stopParam) : null);
  const l = line.data;

  // Sem ponto escolhido: o ponto da linha mais perto de mim (ou o primeiro)
  const auto = useMemo(() => {
    if (!l?.stops.length) return null;
    if (!position) return l.stops[0]!.id;
    const d = (s: { lat: number; lng: number }) => (s.lat - position.latitude) ** 2 + (s.lng - position.longitude) ** 2;
    return l.stops.reduce((best, s) => (d(s) < d(best) ? s : best)).id;
  }, [l, position]);
  const stopId = picked ?? auto;

  const live = useApi<LiveLine>(stopId != null ? `/lines/${lineId}/vehicles?stopId=${stopId}` : `/lines/${lineId}/vehicles`, {
    refetchInterval: LIVE_REFRESH_MS,
  });
  const v = live.data;
  const next = v?.stop?.arrivals[0];

  // Contagem regressiva em segundos até a chegada prevista, andando entre as atualizações
  const nowMs = useNow(1000);
  // Segundos até a chegada: (chegada prevista − hora do servidor) − tempo desde a resposta.
  // Usa só diferenças medidas no mesmo relógio: o relógio do aparelho adiantado não atrapalha.
  const secs =
    next?.etaAt && v && live.dataUpdatedAt
      ? Math.max(0, (Date.parse(next.etaAt) - Date.parse(v.updatedAt)) / 1000 - (nowMs - live.dataUpdatedAt) / 1000)
      : next
        ? next.inMin * 60
        : null;

  const paths = useMemo(() => (l ? [{ id: `l${l.id}`, coords: l.shape.map(toLatLng), color: l.color }] : []), [l]);
  const points = useMemo<MapPoint[]>(() => {
    if (!l) return [];
    const stops: MapPoint[] = l.stops.map((s) => ({
      id: `s${s.id}`,
      coord: toLatLng(s),
      kind: s.id === stopId ? 'highlight' : 'stop',
      label: s.name,
      color: s.id === stopId ? theme.colors.red : l.color,
    }));
    const buses: MapPoint[] = (v?.vehicles ?? []).map((b) => ({
      id: `v${b.id}`,
      coord: { latitude: b.lat, longitude: b.lng },
      kind: 'vehicle',
      badge: b.lineCode,
      heading: b.heading,
      color: b.delayMin >= 5 ? theme.colors.amberDeep : theme.colors.green,
      label: `Saiu ${b.departedAt} · ${delayLabel(b.delayMin)}${b.nextStop ? ` · próxima: ${b.nextStop.name}` : ''}`,
    }));
    return [...stops, ...buses];
  }, [l, v, stopId]);

  if (!l) return <Screen title="Ao vivo">{line.isLoading ? <Loading /> : <ErrorNote message="Linha não encontrada ou sem conexão." onRetry={() => void line.refetch()} />}</Screen>;

  const stop = l.stops.find((s) => s.id === stopId);
  // Próximo ônibus que ainda vai passar no ponto escolhido
  const stopIdx = l.stops.findIndex((s) => s.id === stopId);
  const coming = (v?.vehicles ?? [])
    .filter((b) => b.nextStop && b.nextStop.seq <= (l.stops[stopIdx]?.seq ?? 0))
    .sort((a, b) => b.progress - a.progress)[0];
  const comingIdx = coming?.nextStop ? l.stops.findIndex((s) => s.seq === coming.nextStop!.seq) : -1;

  return (
    <Screen title={`${l.code} · ${l.name}`} subtitle="Acompanhar ônibus">
      <TransitMap height={300} paths={paths} points={points} user={position} showLocateButton onPointPress={(id) => id.startsWith('s') && setStopId(Number(id.slice(1)))} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {online && v ? (
            <Pill label={`● Ao vivo · ${v.vehicles.length} ${v.vehicles.length === 1 ? 'ônibus' : 'ônibus'}`} tone="green" />
          ) : (
            <Pill label="Sem conexão — sem posição ao vivo" tone="red" />
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compartilhar minha rota"
          hitSlop={8}
          onPress={() => router.push(`/share?lineId=${l.id}${stopId ? `&destStopId=${l.stops.at(-1)!.id}` : ''}`)}
        >
          <Icon name="share" size={20} color={theme.colors.textSoft} />
        </Pressable>
      </View>

      {uniqueAlerts(v?.alerts).map((a) => <View key={a.id} style={{ marginTop: 10 }}><AlertBanner kind={a.kind} title={a.kind === 'detour' ? `Rota alterada: ${a.title}` : a.title} message={a.message} /></View>)}

      <Card style={{ marginTop: 12 }}>
        <T v="caption">PRÓXIMO ÔNIBUS EM</T>
        <T
          v="h1"
          color={theme.colors.blueDeep}
          style={{ fontFamily: theme.font.mono, fontSize: 40, letterSpacing: -1, marginVertical: 4 }}
          accessibilityLabel={next ? `Chega em ${etaLabel(next.inMin)}` : 'Sem previsão'}
        >
          {secs != null ? countdown(secs) : '--:--'}
        </T>
        <T v="small">
          {stop ? `até o ponto ${stop.name}` : 'Escolha um ponto'}
          {next ? ` · previsto ${next.at}${next.live ? ` (${delayLabel(next.delayMin)})` : ' pela programação'}` : ''}
        </T>
        {v?.stop?.arrivals.slice(1).length ? (
          <T v="caption" style={{ marginTop: 6 }}>
            Depois: {v.stop.arrivals.slice(1).map((a) => a.at).join(' · ')}
          </T>
        ) : null}
        {stop && (
          <Button
            title="Avisar quando estiver chegando"
            icon="bell"
            variant="secondary"
            onPress={() => router.push(`/alerts/new?lineId=${l.id}&stopId=${stop.id}`)}
            style={{ marginTop: 12 }}
          />
        )}
      </Card>

      <T v="label" style={{ marginTop: 16, marginBottom: 8 }}>
        Ponto de embarque
      </T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {l.stops.map((s) => (
          <Chip key={s.seq} label={s.name} active={s.id === stopId} onPress={() => setStopId(s.id)} />
        ))}
      </ScrollView>

      {coming && comingIdx >= 0 && (
        <>
          <T v="label" style={{ marginTop: 16, marginBottom: 8 }}>
            Ônibus das {coming.departedAt} — próximas paradas
          </T>
          <Card style={{ paddingVertical: 4 }}>
            {l.stops.slice(comingIdx, Math.min(l.stops.length, Math.max(comingIdx + 3, stopIdx + 1))).map((s) => {
              const inMin = coming.nextStop!.inMin + (s.offsetMin - l.stops[comingIdx]!.offsetMin);
              return (
                <View key={s.seq} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 9 }}>
                  <T v="mono" color={theme.colors.textSoft} style={{ width: 56 }}>
                    {etaLabel(inMin)}
                  </T>
                  <T v="body" style={{ flex: 1 }}>
                    {s.name}
                  </T>
                  {s.id === stopId && (
                    <T v="label" color={theme.colors.primary}>
                      você
                    </T>
                  )}
                </View>
              );
            })}
          </Card>
        </>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'center' }}>
        <LineBadge code={l.code} color={l.color} size="sm" />
        <T v="caption" style={{ flex: 1 }}>
          Posição simulada a partir da programação e atualizada a cada {LIVE_REFRESH_MS / 1000} s.
        </T>
      </View>
    </Screen>
  );
}
