import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '../../../components/Icon';
import { TransitMap, type MapPoint } from '../../../components/map';
import { AlertBanner, Button, Card, ErrorNote, LineBadge, Loading, Pill, Screen, Stars, T } from '../../../components/ui';
import { useApp } from '../../../lib/app-state';
import { useToggleFavorite } from '../../../lib/favorites';
import { delayLabel, etaLabel, minutesLabel, ratingLabel, SERVICE_LABEL, uniqueAlerts } from '../../../lib/format';
import { useOnline } from '../../../lib/network';
import { minutesOfDay, offlineArrivals } from '../../../lib/schedule';
import { useNow } from '../../../lib/use-now';
import { formatDistance, toLatLng } from '../../../lib/geo';
import { useCurrentLocation } from '../../../lib/location';
import { useApi } from '../../../lib/query';
import { theme } from '../../../lib/theme';
import type { Arrival, LineDetail, LiveLine } from '../../../lib/types';

/**
 * US07 — trajeto da linha no mapa; US08 — paradas com o próximo horário; US11 — favoritar.
 * Sprint 2: ônibus ao vivo (US16), avisos (US17), avaliação (US21/US22), denúncias (US23/US24), offline (US27).
 */
export default function LineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useApp();
  const online = useOnline();
  const line = useApi<LineDetail>(`/lines/${id}`, { refetchInterval: 60_000 });
  const live = useApi<LiveLine>(line.data?.operating ? `/lines/${id}/vehicles` : null, { refetchInterval: 10_000 });
  const { position } = useCurrentLocation();
  const toggle = useToggleFavorite();
  const l = line.data;
  const now = useNow();
  // US27 — sem internet (ou dado velho), o próximo horário de cada parada é calculado no aparelho
  const stale = !online || (line.savedAt != null && now - line.savedAt > 5 * 60_000);
  const nowMin = minutesOfDay(new Date(now));
  const nextOf = (s: LineDetail['stops'][number]): Arrival | null =>
    stale && l?.operating ? (offlineArrivals(l, [s.offsetMin], nowMin, 1)[0] ?? null) : s.nextArrival;

  const paths = useMemo(() => (l ? [{ id: `l${l.id}`, coords: l.shape.map(toLatLng), color: l.color }] : []), [l]);
  const points = useMemo<MapPoint[]>(
    () =>
      l
        ? l.stops.map((s, i) => ({
            id: `s${s.id}`,
            coord: toLatLng(s),
            kind: i === 0 || i === l.stops.length - 1 ? 'highlight' : 'stop',
            label: s.name,
            color: l.color,
          }))
        : [],
    [l],
  );
  const vehicles = useMemo<MapPoint[]>(
    () =>
      (online ? (live.data?.vehicles ?? []) : []).map((v) => ({
        id: `v${v.id}`,
        coord: { latitude: v.lat, longitude: v.lng },
        kind: 'vehicle',
        badge: v.lineCode,
        heading: v.heading,
        color: v.delayMin >= 5 ? theme.colors.amberDeep : theme.colors.green,
        label: `Saiu ${v.departedAt} · ${delayLabel(v.delayMin)}`,
      })),
    [live.data, online],
  );
  const mapPoints = useMemo(() => [...points, ...vehicles], [points, vehicles]);

  if (!l) {
    return (
      <Screen title="Linha">
        {line.isLoading ? <Loading /> : <ErrorNote message="Linha não encontrada ou sem conexão." onRetry={() => void line.refetch()} />}
      </Screen>
    );
  }

  return (
    <Screen
      title={`${l.code} · ${l.name}`}
      subtitle={`${l.stops.length} paradas`}
      right={
        (l.operating || l.isFavorite) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={l.isFavorite ? 'Remover dos favoritos' : 'Favoritar linha'}
            hitSlop={10}
            onPress={() => toggle.mutate(l)}
          >
            <Icon name={l.isFavorite ? 'starfill' : 'star'} size={26} color={l.isFavorite ? theme.colors.gold : theme.colors.textFaint} />
          </Pressable>
        )
      }
    >
      <Card style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <LineBadge code={l.code} color={l.color} size="lg" />
          <View style={{ flex: 1, gap: 3 }}>
            <T v="h3">
              {l.origin} → {l.destination}
            </T>
            <T v="small">
              Primeiro {l.firstDeparture} · Último {l.lastDeparture} · a cada {l.headwayMin} min
            </T>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              <Pill label={SERVICE_LABEL[l.serviceType]} tone={l.serviceType === 'normal' ? 'blue' : 'purple'} />
              <Pill label={`${formatDistance(l.lengthM)} · ${minutesLabel(l.durationMin)} de ponta a ponta`} tone="green" />
              {l.isFavorite && <Pill label="★ Favorita" tone="amber" />}
            </View>
          </View>
        </View>
      </Card>

      {uniqueAlerts(l.alerts).map((a) => (
        <AlertBanner key={a.id} kind={a.kind} title={a.active ? a.title : `Programado: ${a.title}`} message={a.message} />
      ))}

      {/* US07 — trajeto no mapa */}
      <TransitMap
        height={260}
        paths={paths}
        points={mapPoints}
        user={position}
        onPointPress={(pid) => (pid.startsWith('s') ? router.push(`/stops/${pid.slice(1)}`) : router.push(`/live/${l.id}`))}
      />
      <T v="caption" style={{ marginTop: 6, marginBottom: 14 }} center>
        Toque em uma parada do mapa para ver os horários{vehicles.length ? ' · ônibus em verde: no horário; laranja: atrasado' : ''}.
      </T>

      {l.operating ? (
        <View style={{ gap: 8, marginBottom: 16 }}>
          <Button
            title={online && live.data ? `Ver ônibus ao vivo (${live.data.vehicles.length})` : 'Ver ônibus ao vivo'}
            icon="bus"
            onPress={() => router.push(`/live/${l.id}`)}
          />
          {user && <Button title="Registrar viagem nesta linha" icon="history" variant="secondary" onPress={() => router.push(`/lines/${l.id}/trip`)} />}
        </View>
      ) : (
        <View style={{ backgroundColor: theme.colors.redTint, borderRadius: 12, padding: 12, marginBottom: 16 }}>
          <T v="small" color={theme.colors.redDeep}>
            Linha desativada: não circula no momento.
          </T>
        </View>
      )}

      {/* US21/US22 — avaliação; US23/US24 — denúncias */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <Card onPress={() => router.push(`/lines/${l.id}/rate`)} style={{ flex: 1 }} accessibilityLabel="Avaliações da linha">
          <T v="caption">AVALIAÇÃO</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <T v="h2" style={{ fontFamily: theme.font.mono }}>
              {l.rating.average != null ? ratingLabel(l.rating.average) : '—'}
            </T>
            <Stars value={l.rating.average ?? 0} size={12} />
          </View>
          <T v="small">{l.rating.count ? `${l.rating.count} avaliações · avaliar` : 'Seja o primeiro a avaliar'}</T>
        </Card>
        <Card onPress={() => router.push(`/lines/${l.id}/reports`)} style={{ flex: 1 }} accessibilityLabel="Denúncias da linha">
          <T v="caption">PROBLEMAS</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Icon name="flag" size={20} color={theme.colors.red} />
            <T v="h3">Denúncias</T>
          </View>
          <T v="small">Ver relatos ou denunciar</T>
        </Card>
      </View>

      {/* US08 — paradas em ordem, com o próximo horário previsto (US09) */}
      <T v="label" style={{ marginBottom: 8 }}>
        Paradas e próximo horário{stale && l.operating ? (online ? ' (pela programação)' : ' (pela programação, sem internet)') : ''}
      </T>
      <Card>
        {l.stops.map((s, i) => {
          const last = i === l.stops.length - 1;
          const next = nextOf(s);
          return (
            <Pressable
              key={`${s.seq}`}
              accessibilityRole="button"
              accessibilityLabel={`${s.name}, ${next ? `próximo às ${next.at}` : 'sem previsão'}`}
              onPress={() => router.push(`/stops/${s.id}`)}
              style={{ flexDirection: 'row', gap: 12 }}
            >
              <View style={{ width: 56, alignItems: 'flex-end', paddingTop: 1 }}>
                <T v="mono" color={next && next.inMin <= 3 ? theme.colors.green : theme.colors.textSoft}>
                  {etaLabel(next?.inMin)}
                </T>
                {next?.live && !!next.delayMin && (
                  <T v="caption" color={theme.colors.amberDeep}>
                    +{next.delayMin}
                  </T>
                )}
              </View>
              <View style={{ alignItems: 'center', width: 14 }}>
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    borderWidth: 3,
                    borderColor: l.color,
                    backgroundColor: i === 0 || last ? l.color : theme.colors.surface,
                  }}
                />
                {!last && <View style={{ width: 3, flex: 1, backgroundColor: l.color, opacity: 0.35, minHeight: 26 }} />}
              </View>
              <View style={{ flex: 1, paddingBottom: last ? 0 : 16 }}>
                <T v="h3" style={{ fontSize: 14 }}>
                  {s.name}
                </T>
                <T v="caption">
                  {s.code}
                  {s.linesCount > 1 ? ` · ${s.linesCount} linhas` : ''}
                </T>
              </View>
            </Pressable>
          );
        })}
      </Card>
    </Screen>
  );
}
