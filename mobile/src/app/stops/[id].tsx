import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { TransitMap } from '../../components/map';
import { Card, ErrorNote, LineBadge, Loading, Pill, Screen, T } from '../../components/ui';
import { etaLabel, SERVICE_LABEL } from '../../lib/format';
import { distanceM, formatDistance, toLatLng } from '../../lib/geo';
import { useCurrentLocation } from '../../lib/location';
import { useApi } from '../../lib/query';
import { theme } from '../../lib/theme';
import type { StopDetail } from '../../lib/types';

/** US09 — linhas que passam na parada e horários previstos (próximos e tabela do dia). */
export default function StopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const stop = useApi<StopDetail>(`/stops/${id}`, { refetchInterval: 30_000 });
  const { position } = useCurrentLocation();
  const [open, setOpen] = useState<number | null>(null);
  const s = stop.data;
  const here = useMemo(() => (s ? toLatLng(s) : null), [s]);
  const points = useMemo(() => (s && here ? [{ id: 'stop', coord: here, kind: 'highlight' as const, label: s.name }] : []), [s, here]);

  if (!s || !here)
    return <Screen title="Ponto de parada">{stop.isLoading ? <Loading /> : <ErrorNote message="Ponto não encontrado." />}</Screen>;

  const away = position ? distanceM(position, here) : null;

  return (
    <Screen title={s.name} subtitle={`Ponto ${s.code}${away != null ? ` · a ${formatDistance(away)} de você` : ''}`}>
      <TransitMap height={170} user={position} points={points} fitTo={[here]} />
      <T v="label" style={{ marginTop: 18, marginBottom: 8 }}>
        {s.lines.length} {s.lines.length === 1 ? 'linha passa' : 'linhas passam'} aqui
      </T>
      {s.lines.length === 0 && <T v="small">Nenhuma linha ativa neste ponto.</T>}
      {s.lines.map((l) => {
        const [first, ...rest] = l.arrivals;
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
                {first && <T v="caption">às {first.at}</T>}
              </View>
              <Icon name={expanded ? 'chevrondown' : 'chevron'} size={18} color={theme.colors.textFaint} />
            </Pressable>
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
                <Pressable accessibilityRole="link" onPress={() => router.push(`/lines/${l.id}`)} style={{ marginTop: 10 }}>
                  <T v="label" color={theme.colors.primary}>
                    Ver trajeto da linha {l.code} →
                  </T>
                </Pressable>
              </View>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
