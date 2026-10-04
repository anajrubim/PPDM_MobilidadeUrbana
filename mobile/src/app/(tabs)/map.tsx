import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../components/Icon';
import { TransitMap, type MapPoint } from '../../components/map';
import { Button, Card, Chip, LineBadge, T } from '../../components/ui';
import { formatDistance, toLatLng } from '../../lib/geo';
import { useCurrentLocation } from '../../lib/location';
import { useApi } from '../../lib/query';
import { theme } from '../../lib/theme';
import type { LineDetail, LineSummary, StopSummary } from '../../lib/types';

/** US10 — minha localização no mapa e os pontos mais próximos; mostra também o trajeto de uma favorita. */
export default function MapTab() {
  const insets = useSafeAreaInsets();
  const { position, status, retry } = useCurrentLocation({ watch: true });
  const [lineId, setLineId] = useState<number | null>(null);

  const nearby = useApi<StopSummary[]>(
    position ? `/stops?sort=distance&lat=${position.latitude.toFixed(5)}&lng=${position.longitude.toFixed(5)}&limit=6` : null,
  );
  const favorites = useApi<LineSummary[]>('/me/favorites');
  const line = useApi<LineDetail>(lineId ? `/lines/${lineId}` : null);

  const points = useMemo<MapPoint[]>(() => {
    if (line.data)
      return line.data.stops.map((s) => ({ id: `s${s.id}`, coord: toLatLng(s), kind: 'stop', label: s.name, color: line.data!.color }));
    return (nearby.data ?? []).map((s) => ({ id: `s${s.id}`, coord: toLatLng(s), kind: 'stop', label: s.name }));
  }, [line.data, nearby.data]);
  const paths = useMemo(
    () => (line.data ? [{ id: `l${line.data.id}`, coords: line.data.shape.map(toLatLng), color: line.data.color }] : []),
    [line.data],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 16,
          paddingBottom: 10,
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: 1,
        }}
      >
        <T v="h2">Mapa</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
          <Chip label="Onde estou" icon="target" active={!lineId} onPress={() => setLineId(null)} />
          {favorites.data?.map((f) => (
            <Chip key={f.id} label={`Linha ${f.code}`} icon="bus" active={lineId === f.id} onPress={() => setLineId(f.id)} />
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 24, gap: 8 }}>
        <TransitMap
          height={380}
          user={position}
          paths={paths}
          points={points}
          showLocateButton
          onPointPress={(id) => router.push(`/stops/${id.slice(1)}`)}
        />
        {/* US10 — estado da localização */}
        <Card style={{ marginTop: 4 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Icon name="target" size={20} color={position ? theme.colors.green : theme.colors.amberDeep} />
            <View style={{ flex: 1 }}>
              <T v="h3" style={{ fontSize: 14 }}>
                {position
                  ? 'Você está aqui'
                  : status === 'denied'
                    ? 'Localização não permitida'
                    : status === 'unavailable'
                      ? 'Localização indisponível'
                      : 'Procurando sua localização…'}
              </T>
              <T v="small">
                {position
                  ? `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`
                  : status === 'denied'
                    ? 'Permita o acesso à localização para ver onde você está.'
                    : 'Ative o GPS do aparelho.'}
              </T>
            </View>
            {(status === 'denied' || status === 'unavailable') && <Button title="Tentar de novo" variant="secondary" onPress={retry} />}
          </View>
        </Card>

        {line.data ? (
          <Card onPress={() => router.push(`/lines/${line.data!.id}`)}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <LineBadge code={line.data.code} color={line.data.color} />
              <View style={{ flex: 1 }}>
                <T v="h3">{line.data.name}</T>
                <T v="small">
                  {line.data.stops.length} paradas · {formatDistance(line.data.lengthM)} de trajeto
                </T>
              </View>
              <Icon name="chevron" size={18} color={theme.colors.textFaint} />
            </View>
          </Card>
        ) : (
          <>
            {nearby.data && nearby.data.length > 0 && (
              <T v="label" style={{ marginTop: 6 }}>
                Pontos mais próximos
              </T>
            )}
            {nearby.data?.map((s) => (
              <Card key={s.id} onPress={() => router.push(`/stops/${s.id}`)} accessibilityLabel={`Parada próxima ${s.name}`}>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Icon name="pin" size={20} color={theme.colors.primary} />
                  <View style={{ flex: 1 }}>
                    <T v="h3" numberOfLines={1}>
                      {s.name}
                    </T>
                    <T v="small">{s.lines.length ? `Linhas ${s.lines.join(', ')}` : 'Sem linhas ativas'}</T>
                  </View>
                  {s.distanceM != null && <T v="label">{formatDistance(s.distanceM)}</T>}
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
