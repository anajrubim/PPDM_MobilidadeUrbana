import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '../../../components/Icon';
import { TransitMap, type MapPoint } from '../../../components/map';
import { Button, Card, ErrorNote, LineBadge, Loading, Pill, Screen, T } from '../../../components/ui';
import { useToggleFavorite } from '../../../lib/favorites';
import { etaLabel, minutesLabel, SERVICE_LABEL } from '../../../lib/format';
import { formatDistance, toLatLng } from '../../../lib/geo';
import { useCurrentLocation } from '../../../lib/location';
import { useApi } from '../../../lib/query';
import { theme } from '../../../lib/theme';
import type { LineDetail } from '../../../lib/types';

/** US07 — trajeto da linha no mapa; US08 — paradas da linha com o próximo horário; US11 — favoritar. */
export default function LineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const line = useApi<LineDetail>(`/lines/${id}`, { refetchInterval: 60_000 });
  const { position } = useCurrentLocation();
  const toggle = useToggleFavorite();
  const l = line.data;

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

      {/* US07 — trajeto no mapa */}
      <TransitMap
        height={260}
        paths={paths}
        points={points}
        user={position}
        onPointPress={(pid) => router.push(`/stops/${pid.slice(1)}`)}
      />
      <T v="caption" style={{ marginTop: 6, marginBottom: 14 }} center>
        Toque em uma parada do mapa para ver os horários.
      </T>

      {l.operating ? (
        <Button
          title="Registrar viagem nesta linha"
          icon="history"
          variant="secondary"
          onPress={() => router.push(`/lines/${l.id}/trip`)}
          style={{ marginBottom: 16 }}
        />
      ) : (
        <View style={{ backgroundColor: theme.colors.redTint, borderRadius: 12, padding: 12, marginBottom: 16 }}>
          <T v="small" color={theme.colors.redDeep}>
            Linha desativada: não circula no momento.
          </T>
        </View>
      )}

      {/* US08 — paradas em ordem, com o próximo horário previsto (US09) */}
      <T v="label" style={{ marginBottom: 8 }}>
        Paradas e próximo horário
      </T>
      <Card>
        {l.stops.map((s, i) => {
          const last = i === l.stops.length - 1;
          return (
            <Pressable
              key={`${s.seq}`}
              accessibilityRole="button"
              accessibilityLabel={`${s.name}, ${s.nextArrival ? `próximo às ${s.nextArrival.at}` : 'sem previsão'}`}
              onPress={() => router.push(`/stops/${s.id}`)}
              style={{ flexDirection: 'row', gap: 12 }}
            >
              <View style={{ width: 56, alignItems: 'flex-end', paddingTop: 1 }}>
                <T v="mono" color={s.nextArrival && s.nextArrival.inMin <= 3 ? theme.colors.green : theme.colors.textSoft}>
                  {etaLabel(s.nextArrival?.inMin)}
                </T>
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
