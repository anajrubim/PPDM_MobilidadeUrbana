import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Card, Chip, ErrorNote, LineBadge, Loading, Screen, SuccessNote, T } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { queryClient, useApi } from '../../lib/query';
import { useSingleFlight } from '../../lib/single-flight';
import { theme } from '../../lib/theme';
import type { LineDetail, LineSummary, ProximityAlert } from '../../lib/types';

const MINUTES = [2, 5, 10, 15];
const WINDOWS = [
  { key: 'all', label: 'O dia todo', start: null, end: null },
  { key: 'morning', label: 'Manhã (6h–10h)', start: '06:00', end: '10:00' },
  { key: 'evening', label: 'Fim da tarde (16h–20h)', start: '16:00', end: '20:00' },
] as const;

/** US18 — criar alerta: linha → ponto → minutos de antecedência → horário. */
export default function NewAlert() {
  const params = useLocalSearchParams<{ lineId?: string; stopId?: string }>();
  const [lineId, setLineId] = useState<number | null>(params.lineId ? Number(params.lineId) : null);
  const [stopId, setStopId] = useState<number | null>(params.stopId ? Number(params.stopId) : null);
  const [minutes, setMinutes] = useState(5);
  const [win, setWin] = useState<(typeof WINDOWS)[number]['key']>('all');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ProximityAlert | null>(null);
  const [busy, setBusy] = useState(false);
  const once = useSingleFlight();
  const lines = useApi<LineSummary[]>(lineId ? null : '/lines');
  const line = useApi<LineDetail>(lineId ? `/lines/${lineId}` : null);

  const save = () =>
    once(async () => {
      if (!lineId || !stopId) return;
      const w = WINDOWS.find((x) => x.key === win)!;
      setBusy(true);
      setError(null);
      try {
        const a = await api.post<ProximityAlert>('/me/alerts', { lineId, stopId, minutesBefore: minutes, windowStart: w.start, windowEnd: w.end });
        setSaved(a);
        await queryClient.invalidateQueries({ queryKey: ['me', 'alerts'] });
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    });

  if (saved) {
    return (
      <Screen title="Alerta criado">
        <SuccessNote message={`Pronto! Avisamos quando a linha ${saved.line.code} estiver a ${saved.minutesBefore} min de ${saved.stop.name}.`} />
        <Button title="Ver meus alertas" icon="target" onPress={() => router.replace('/alerts')} />
        <Button title="Voltar" variant="ghost" onPress={() => router.back()} style={{ marginTop: 8 }} />
      </Screen>
    );
  }

  return (
    <Screen title="Novo alerta de proximidade">
      {!lineId ? (
        <>
          <T v="label" style={{ marginBottom: 8 }}>
            1. Qual linha?
          </T>
          {lines.isLoading && <Loading />}
          {lines.data
            ?.filter((l) => l.operating)
            .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite))
            .map((l) => (
              <Card key={l.id} onPress={() => setLineId(l.id)} style={{ marginBottom: 8 }} accessibilityLabel={`Linha ${l.code}`}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <LineBadge code={l.code} color={l.color} />
                  <T v="h3" style={{ flex: 1 }} numberOfLines={1}>
                    {l.name}
                  </T>
                  {l.isFavorite && <T v="label" color={theme.colors.gold}>★</T>}
                </View>
              </Card>
            ))}
        </>
      ) : !line.data ? (
        <Loading />
      ) : (
        <>
          <Card style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <LineBadge code={line.data.code} color={line.data.color} />
              <T v="h3" style={{ flex: 1 }}>
                {line.data.name}
              </T>
              {!params.lineId && (
                <Pressable accessibilityRole="button" onPress={() => { setLineId(null); setStopId(null); }}>
                  <T v="label" color={theme.colors.primary}>
                    trocar
                  </T>
                </Pressable>
              )}
            </View>
          </Card>
          <T v="label" style={{ marginBottom: 8 }}>
            2. Em qual ponto você embarca?
          </T>
          <Card style={{ paddingVertical: 2, marginBottom: 14 }}>
            {line.data.stops.slice(0, -1).map((s, i) => (
              <Pressable
                key={s.seq}
                accessibilityRole="radio"
                accessibilityState={{ selected: s.id === stopId }}
                onPress={() => setStopId(s.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: theme.colors.border }}
              >
                <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: s.id === stopId ? theme.colors.primary : theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  {s.id === stopId && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: theme.colors.primary }} />}
                </View>
                <T v="body" style={{ flex: 1 }}>
                  {s.name}
                </T>
              </Pressable>
            ))}
          </Card>
          <T v="label" style={{ marginBottom: 8 }}>
            3. Avisar com quantos minutos de antecedência?
          </T>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {MINUTES.map((m) => (
              <Chip key={m} label={`${m} min`} active={minutes === m} onPress={() => setMinutes(m)} />
            ))}
          </View>
          <T v="label" style={{ marginBottom: 8 }}>
            4. Em que horário?
          </T>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {WINDOWS.map((w) => (
              <Chip key={w.key} label={w.label} active={win === w.key} onPress={() => setWin(w.key)} />
            ))}
          </View>
          {error && <ErrorNote message={error} />}
          <Button title="Criar alerta" icon="bell" onPress={save} loading={busy} disabled={!stopId} />
        </>
      )}
    </Screen>
  );
}
