import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { TransitMap } from '../components/map';
import { Button, Card, Chip, ErrorNote, LineBadge, Screen, SuccessNote, T } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useApp } from '../lib/app-state';
import { ask } from '../lib/dialog';
import { useCurrentLocation } from '../lib/location';
import { queryClient, useApi } from '../lib/query';
import { openShareSheet } from '../lib/share';
import { useSingleFlight } from '../lib/single-flight';
import { theme } from '../lib/theme';
import type { LineDetail, LocationShare } from '../lib/types';

const DURATIONS = [15, 30, 60, 120];
/** O link só volta da API na criação: fica guardado no aparelho para poder reenviar. */
const URLS_KEY = 'dmr.share.urls';

async function savedUrls(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(URLS_KEY)) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

/** US29 — compartilhar localização (e a rota do ônibus) com um contato por um link temporário. */
export default function ShareLocation() {
  const params = useLocalSearchParams<{ lineId?: string; destStopId?: string }>();
  const { user } = useApp();
  const { position, status, retry } = useCurrentLocation();
  const [duration, setDuration] = useState(30);
  const [withRoute, setWithRoute] = useState(!!params.lineId);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const once = useSingleFlight();
  const line = useApi<LineDetail>(params.lineId ? `/lines/${params.lineId}` : null);
  const shares = useApi<LocationShare[]>(user ? '/me/shares' : null, { refetchInterval: 30_000 });
  const dest = line.data?.stops.find((s) => String(s.id) === params.destStopId);

  useEffect(() => {
    void savedUrls().then(setUrls);
  }, []);
  const stop = useMutation({
    mutationFn: (id: string) => api.del(`/me/shares/${id}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['me', 'shares'] }),
  });

  const points = useMemo(() => (dest ? [{ id: 'dest', coord: { latitude: dest.lat, longitude: dest.lng }, kind: 'highlight' as const, label: dest.name }] : []), [dest]);

  if (!user) return <Redirect href="/login" />;

  const create = () =>
    once(async () => {
      if (!position) return;
      setBusy(true);
      setError(null);
      setInfo(null);
      try {
        const s = await api.post<LocationShare>('/me/shares', {
          lat: position.latitude,
          lng: position.longitude,
          lineId: withRoute && line.data ? line.data.id : null,
          destStopId: withRoute && dest ? dest.id : null,
          durationMin: duration,
        });
        const next = { ...(await savedUrls()), [s.id]: s.url! };
        await AsyncStorage.setItem(URLS_KEY, JSON.stringify(next)).catch(() => undefined);
        setUrls(next);
        await queryClient.invalidateQueries({ queryKey: ['me', 'shares'] });
        const r = await openShareSheet(s, user.name);
        setInfo(r === 'copied' ? 'Link copiado. Cole na conversa com seu contato.' : 'Compartilhamento ativo. Seu contato vê sua posição pelo link.');
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    });

  const active = (shares.data ?? []).filter((s) => s.active);

  return (
    <Screen title="Compartilhar localização" subtitle="Seu contato acompanha pelo link, sem instalar nada">
      <TransitMap height={200} user={position} points={points} />
      {!position && (
        <View style={{ marginTop: 12 }}>
          <ErrorNote
            message={status === 'denied' ? 'Permita o acesso à localização para compartilhar onde você está.' : 'Procurando sua localização…'}
            onRetry={status === 'denied' || status === 'unavailable' ? retry : undefined}
          />
        </View>
      )}

      {line.data && (
        <Card style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <LineBadge code={line.data.code} color={line.data.color} />
            <View style={{ flex: 1 }}>
              <T v="h3">Incluir a rota</T>
              <T v="small">{dest ? `Linha ${line.data.code} até ${dest.name}, com a chegada prevista` : `Linha ${line.data.code}`}</T>
            </View>
            <Chip label={withRoute ? 'Sim' : 'Não'} active={withRoute} onPress={() => setWithRoute(!withRoute)} />
          </View>
        </Card>
      )}

      <T v="label" style={{ marginTop: 16, marginBottom: 8 }}>
        Por quanto tempo?
      </T>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {DURATIONS.map((d) => (
          <Chip key={d} label={d < 60 ? `${d} min` : `${d / 60} h`} active={duration === d} onPress={() => setDuration(d)} />
        ))}
      </View>
      {error && <ErrorNote message={error} />}
      {info && <SuccessNote message={info} />}
      <Button title="Compartilhar agora" icon="share" onPress={create} loading={busy} disabled={!position} />
      <T v="caption" center style={{ marginTop: 8 }}>
        A posição é atualizada enquanto o app está aberto. Depois do prazo, ou se você parar, o link deixa de mostrar onde você está.
      </T>

      {active.length > 0 && (
        <>
          <T v="label" style={{ marginTop: 22, marginBottom: 8 }}>
            Compartilhamentos ativos
          </T>
          {active.map((s) => (
            <Card key={s.id} style={{ marginBottom: 8 }}>
              <T v="h3">{s.route ? `Rota da linha ${s.route.line.code}${s.route.dest ? ` até ${s.route.dest.name}` : ''}` : 'Minha localização'}</T>
              <T v="small">
                Até {new Date(s.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                {s.route?.eta ? ` · chegada prevista ${s.route.eta}` : ''}
              </T>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                {urls[s.id] && (
                  <Button title="Enviar de novo" icon="share" variant="secondary" onPress={() => void openShareSheet({ ...s, url: urls[s.id] }, user.name)} style={{ flex: 1 }} />
                )}
                <Button
                  title="Parar"
                  variant="danger"
                  onPress={() =>
                    ask('Parar de compartilhar?', 'O link deixa de mostrar sua localização.', [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Parar', style: 'destructive', onPress: () => stop.mutate(s.id) },
                    ])
                  }
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          ))}
        </>
      )}
      <T v="caption" center color={theme.colors.textFaint} style={{ marginTop: 12 }}>
        Compartilhe só com pessoas de confiança.
      </T>
    </Screen>
  );
}
