import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '../../../components/Icon';
import { Button, Card, ErrorNote, LineBadge, Loading, Screen, SuccessNote, T } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../../../lib/app-state';
import { minutesLabel } from '../../../lib/format';
import { queryClient, useApi } from '../../../lib/query';
import { theme } from '../../../lib/theme';
import type { LineDetail, Trip } from '../../../lib/types';
import { useSingleFlight } from '../../../lib/single-flight';

/** US12 — registra uma viagem feita na linha (embarque → desembarque) para o resumo do dashboard. */
export default function RegisterTrip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const line = useApi<LineDetail>(`/lines/${id}`);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Trip | null>(null);
  const l = line.data;
  const once = useSingleFlight();
  const { user } = useApp();

  if (!user) return <Redirect href="/login" />;

  if (!l) return <Screen title="Registrar viagem">{line.isLoading ? <Loading /> : <ErrorNote message="Linha não encontrada." />}</Screen>;

  // Índices na ordem da linha: o desembarque precisa vir depois do embarque
  const pick = (i: number) => {
    setError(null);
    if (from === null || i <= from || to !== null) {
      setFrom(i);
      setTo(null);
    } else setTo(i);
  };
  const est = from !== null && to !== null ? l.stops[to]!.offsetMin - l.stops[from]!.offsetMin : null;

  const save = () =>
    once(async () => {
      if (from === null || to === null) return;
      setBusy(true);
      setError(null);
      try {
        const trip = await api.post<Trip>('/me/trips', { lineId: l.id, originStopId: l.stops[from]!.id, destStopId: l.stops[to]!.id });
        setSaved(trip);
        await queryClient.invalidateQueries({ queryKey: ['me'] });
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    });

  if (saved) {
    return (
      <Screen title="Registrar viagem">
        <SuccessNote message={`Viagem registrada: ${saved.originLabel} → ${saved.destLabel} (${minutesLabel(saved.durationMin)}).`} />
        <Button title="Ver no início" icon="home" onPress={() => router.replace('/home')} />
        <Button title="Voltar para a linha" variant="ghost" onPress={() => router.back()} style={{ marginTop: 8 }} />
      </Screen>
    );
  }

  return (
    <Screen title="Registrar viagem" subtitle={`Linha ${l.code} · ${l.name}`}>
      <Card style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <LineBadge code={l.code} color={l.color} />
          <T v="body" style={{ flex: 1 }}>
            {from === null
              ? '1. Toque na parada onde você embarcou.'
              : to === null
                ? '2. Agora toque na parada onde desceu.'
                : 'Confira e confirme.'}
          </T>
        </View>
      </Card>
      {error && <ErrorNote message={error} />}
      <Card style={{ paddingVertical: 4, marginBottom: 14 }}>
        {l.stops.map((s, i) => {
          const role = i === from ? 'Embarque' : i === to ? 'Desembarque' : null;
          const inside = from !== null && to !== null && i > from && i < to;
          return (
            <Pressable
              key={s.seq}
              accessibilityRole="button"
              accessibilityLabel={`Escolher ${s.name}`}
              onPress={() => pick(i)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 10,
                opacity: from !== null && to === null && i <= from && i !== from ? 0.45 : 1,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 3,
                  borderColor: l.color,
                  backgroundColor: role ? l.color : inside ? theme.colors.tint : theme.colors.surface,
                }}
              />
              <T v="body" style={{ flex: 1, fontFamily: role ? theme.font.bold : theme.font.medium }}>
                {s.name}
              </T>
              {role && (
                <T v="label" color={l.color}>
                  {role}
                </T>
              )}
            </Pressable>
          );
        })}
      </Card>
      {est !== null && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <Icon name="clock" size={18} color={theme.colors.primary} />
          <T v="body">
            {l.stops[from!]!.name} → {l.stops[to!]!.name}: cerca de {minutesLabel(est)}
          </T>
        </View>
      )}
      <Button title="Confirmar viagem" icon="check" onPress={save} loading={busy} disabled={from === null || to === null} />
    </Screen>
  );
}
