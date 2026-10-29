import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '../components/Icon';
import { TransitMap, type MapPoint } from '../components/map';
import { PlacePicker } from '../components/PlacePicker';
import { Button, Card, Chip, Divider, Empty, ErrorNote, LineBadge, Loading, Pill, Screen, SuccessNote, T } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useApp } from '../lib/app-state';
import { delayLabel, isTomorrow, minutesLabel, PLAN_TAG_LABEL } from '../lib/format';
import { formatDistance, toLatLng } from '../lib/geo';
import { useCurrentLocation } from '../lib/location';
import { useOnline } from '../lib/network';
import { queryClient, useApi } from '../lib/query';
import { useSingleFlight } from '../lib/single-flight';
import { theme } from '../lib/theme';
import type { BusLeg, PlanOption, PlanPlace, PlanResult, StopDetail } from '../lib/types';

const WHEN = [
  { key: 0, label: 'Agora' },
  { key: 15, label: 'Em 15 min' },
  { key: 30, label: 'Em 30 min' },
  { key: 60, label: 'Em 1 h' },
] as const;

/** Horário daqui a N minutos (chamado só ao tocar no botão). */
const isoIn = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

function placeQuery(side: 'from' | 'to', p: PlanPlace) {
  return p.stopId != null ? `${side}StopId=${p.stopId}` : `${side}Lat=${p.lat.toFixed(5)}&${side}Lng=${p.lng.toFixed(5)}&${side}Label=${encodeURIComponent(p.name)}`;
}

/** US15 — planejar viagem com baldeação; US26 — tempo estimado de cada opção. */
export default function Plan() {
  const params = useLocalSearchParams<{ toStopId?: string; fromStopId?: string }>();
  const { user } = useApp();
  const online = useOnline();
  const { position } = useCurrentLocation();
  // undefined = a pessoa ainda não escolheu: usa o ponto vindo de outra tela ou a localização atual
  const [fromSel, setFrom] = useState<PlanPlace | null | undefined>(undefined);
  const [toSel, setTo] = useState<PlanPlace | null | undefined>(undefined);
  const [when, setWhen] = useState<number>(0);
  // O horário "em 15 min" é fixado na hora da escolha (a consulta não muda a cada segundo)
  const [at, setAt] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // Destino/origem vindos de outra tela (ex.: "Como chegar aqui" no ponto)
  const toStop = useApi<StopDetail>(params.toStopId ? `/stops/${params.toStopId}` : null);
  const fromStop = useApi<StopDetail>(params.fromStopId ? `/stops/${params.fromStopId}` : null);
  const asPlace = (s?: StopDetail): PlanPlace | null => (s ? { stopId: s.id, name: s.name, lat: s.lat, lng: s.lng } : null);
  const here: PlanPlace | null = position ? { name: 'Minha localização', lat: position.latitude, lng: position.longitude } : null;
  const from = fromSel !== undefined ? fromSel : params.fromStopId ? asPlace(fromStop.data) : here;
  const to = toSel !== undefined ? toSel : asPlace(toStop.data);

  const chooseWhen = (minutes: number) => {
    setWhen(minutes);
    setAt(minutes ? isoIn(minutes) : null);
  };
  const path = from && to ? `/plan?${placeQuery('from', from)}&${placeQuery('to', to)}${at ? `&at=${encodeURIComponent(at)}` : ''}` : null;
  const plan = useApi<PlanResult>(path);
  const options = plan.data?.options ?? [];

  const swap = () => {
    setFrom(to);
    setTo(from);
    setOpen(null);
  };

  return (
    <Screen title="Planejar viagem" subtitle="Rotas com baldeação e tempo estimado">
      <Card style={{ paddingVertical: 2, marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <PlacePicker label="Origem" value={from} onChange={setFrom} here={position} dot="fill" />
            <Divider />
            <PlacePicker label="Destino" value={to} onChange={setTo} here={position} dot="ring" autoFocus={!params.toStopId} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Inverter origem e destino" hitSlop={8} onPress={swap} style={{ padding: 8 }}>
            <Icon name="refresh" size={20} color={theme.colors.primary} />
          </Pressable>
        </View>
      </Card>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {WHEN.map((w) => (
          <Chip key={w.key} label={w.label} icon={w.key === 0 ? 'clock' : undefined} active={when === w.key} onPress={() => chooseWhen(w.key)} />
        ))}
      </View>

      {!online && <ErrorNote message="Sem conexão: o planejamento precisa da internet para calcular as rotas." />}
      {!from || !to ? (
        <Empty icon="route" title="Para onde vamos?" text="Escolha a origem e o destino para ver as opções de ônibus, com baldeação, caminhada e horário de chegada." />
      ) : plan.isLoading ? (
        <Loading label="Calculando rotas…" />
      ) : plan.error && !plan.data ? (
        <ErrorNote message={errorText(plan.error)} onRetry={() => void plan.refetch()} />
      ) : options.length === 0 ? (
        <Empty icon="bus" title="Nenhuma rota encontrada" text="Não há ônibus ligando esses lugares neste horário. Tente outro horário ou um ponto próximo." />
      ) : (
        <>
          <T v="label" style={{ marginBottom: 10 }}>
            {options.length === 1 ? '1 opção encontrada' : `${options.length} opções encontradas`}
          </T>
          {options.map((o, i) => (
            <OptionCard key={o.id} option={o} best={i === 0} open={open === o.id} onToggle={() => setOpen(open === o.id ? null : o.id)} loggedIn={!!user} />
          ))}
          <T v="caption" center style={{ marginTop: 6 }}>
            Tempo estimado = caminhada + espera + viagem, com o atraso atual dos ônibus.
          </T>
        </>
      )}
    </Screen>
  );
}

function Steps({ o }: { o: PlanOption }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      {o.legs.map((l, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {i > 0 && <Icon name="arrow" size={14} color={theme.colors.textFaint} />}
          {l.type === 'walk' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Icon name="walk" size={16} color={theme.colors.textSoft} />
              <T v="small">{l.durationMin} min</T>
            </View>
          ) : (
            <LineBadge code={l.line.code} color={l.line.color} size="sm" />
          )}
        </View>
      ))}
    </View>
  );
}

function OptionCard({ option: o, best, open, onToggle, loggedIn }: { option: PlanOption; best: boolean; open: boolean; onToggle: () => void; loggedIn: boolean }) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const once = useSingleFlight();
  const bus = useMemo(() => o.legs.filter((l): l is BusLeg => l.type === 'bus'), [o]);

  const paths = useMemo(
    () => (open ? bus.map((l, i) => ({ id: `${o.id}-${i}`, coords: l.path.map(toLatLng), color: l.line.color })) : []),
    [open, o.id, bus],
  );
  const points = useMemo<MapPoint[]>(
    () =>
      open
        ? bus.flatMap((l, i) => [
            { id: `f${i}-${l.from.id}`, coord: toLatLng(l.from), kind: 'highlight' as const, label: `Embarque ${l.line.code}: ${l.from.name}`, color: l.line.color },
            { id: `t${i}-${l.to.id}`, coord: toLatLng(l.to), kind: 'stop' as const, label: `Desembarque: ${l.to.name}`, color: l.line.color },
          ])
        : [],
    [open, bus],
  );

  const save = () =>
    once(async () => {
      setBusy(true);
      setError(null);
      try {
        await api.post('/me/trips/planned', {
          legs: bus.map((l) => ({ lineId: l.line.id, originStopId: l.from.id, destStopId: l.to.id })),
          walkMin: o.walkMin,
        });
        setSaved(true);
        await queryClient.invalidateQueries({ queryKey: ['me', 'trips'] });
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    });

  const tag = o.tags.find((t) => t !== 'later') ?? o.tags[0];
  return (
    <Card
      style={{ marginBottom: 10, ...(best ? { borderColor: theme.colors.primary, backgroundColor: theme.colors.tint } : null) }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Fechar detalhes' : 'Ver detalhes da opção'}
        accessibilityHint={`${minutesLabel(o.durationMin)}, sai ${o.departAt}, chega ${o.arriveAt}`}
        onPress={onToggle}
        style={{ gap: 8 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <T v="h2" style={{ fontFamily: theme.font.mono, fontSize: 18 }}>
            {minutesLabel(o.durationMin)}
          </T>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {tag && <Pill label={PLAN_TAG_LABEL[tag]} tone={tag === 'fastest' ? 'blue' : tag === 'later' ? 'purple' : 'green'} />}
            {o.transfers > 0 && <Pill label={o.transfers === 1 ? '1 baldeação' : `${o.transfers} baldeações`} tone="amber" />}
          </View>
        </View>
        <Steps o={o} />
        <T v="small">
          {isTomorrow(o.departAt) ? 'Amanhã · ' : ''}Sair às <T v="small" color={theme.colors.text} style={{ fontFamily: theme.font.bold }}>{o.departAt}</T> · chegar às{' '}
          <T v="small" color={theme.colors.text} style={{ fontFamily: theme.font.bold }}>{o.arriveAt}</T>
          {o.walkM > 0 ? ` · ${formatDistance(o.walkM)} a pé` : ''}
        </T>
      </Pressable>

      {open && (
        <View style={{ marginTop: 12, gap: 10 }}>
          {bus.length > 0 && <TransitMap height={200} paths={paths} points={points} />}
          {o.legs.map((l, i) =>
            l.type === 'walk' ? (
              <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Icon name="walk" size={18} color={theme.colors.textSoft} />
                <T v="small" style={{ flex: 1 }}>
                  Caminhe {formatDistance(l.distanceM)} ({l.durationMin} min) até {l.to.name}
                </T>
              </View>
            ) : (
              <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <LineBadge code={l.line.code} color={l.line.color} size="sm" />
                <View style={{ flex: 1 }}>
                  <T v="h3" style={{ fontSize: 14 }}>
                    {l.departAt} {l.from.name}
                  </T>
                  <T v="small">
                    {l.waitMin > 0 ? `Espera ${l.waitMin} min · ` : ''}
                    {l.stopsCount} {l.stopsCount === 1 ? 'parada' : 'paradas'} · {minutesLabel(l.rideMin)}
                    {l.live ? ` · ao vivo (${delayLabel(l.delayMin)})` : ''}
                  </T>
                  <T v="h3" style={{ fontSize: 14, marginTop: 2 }}>
                    {l.arriveAt} {l.to.name}
                  </T>
                </View>
              </View>
            ),
          )}
          {error && <ErrorNote message={error} />}
          {saved && <SuccessNote message="Viagem guardada no seu histórico como planejada." />}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {bus[0] && (
              <Button
                title="Acompanhar ônibus"
                icon="bus"
                onPress={() => router.push(`/live/${bus[0]!.line.id}?stopId=${bus[0]!.from.id}`)}
                style={{ flexGrow: 1 }}
              />
            )}
            {loggedIn && bus.length > 0 && !saved && (
              <Button title="Salvar no histórico" icon="history" variant="secondary" onPress={save} loading={busy} style={{ flexGrow: 1 }} />
            )}
            {loggedIn && bus.at(-1) && (
              <Button
                title="Compartilhar rota"
                icon="share"
                variant="ghost"
                onPress={() => router.push(`/share?lineId=${bus.at(-1)!.line.id}&destStopId=${bus.at(-1)!.to.id}`)}
              />
            )}
          </View>
        </View>
      )}
    </Card>
  );
}
