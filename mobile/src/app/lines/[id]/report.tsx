import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Icon } from '../../../components/Icon';
import { Button, Card, Chip, ErrorNote, Loading, Screen, T, TextArea } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../../../lib/app-state';
import { REPORT_CATEGORIES } from '../../../lib/format';
import { queryClient, useApi } from '../../../lib/query';
import { useSingleFlight } from '../../../lib/single-flight';
import { theme } from '../../../lib/theme';
import type { LineDetail, Report, ReportCategory } from '../../../lib/types';

/** US23 — denunciar problema na linha/veículo; US25 — confirmação com número de protocolo. */
export default function ReportProblem() {
  const { id, stopId } = useLocalSearchParams<{ id: string; stopId?: string }>();
  const { user } = useApp();
  const line = useApi<LineDetail>(`/lines/${id}`);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [stop, setStop] = useState<number | null>(stopId ? Number(stopId) : null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Report | null>(null);
  const once = useSingleFlight();

  if (!user) return <Redirect href="/login" />;
  const l = line.data;
  if (!l) return <Screen title="Denunciar problema">{line.isLoading ? <Loading /> : <ErrorNote message="Linha não encontrada." />}</Screen>;

  const needsText = category === 'other';
  const submit = () =>
    once(async () => {
      if (!category || (needsText && !text.trim())) return;
      setBusy(true);
      setError(null);
      try {
        const r = await api.post<Report>('/reports', { lineId: l.id, stopId: stop, category, description: text.trim() || null });
        setSent(r);
        await Promise.all([queryClient.invalidateQueries({ queryKey: ['lines', String(l.id)] }), queryClient.invalidateQueries({ queryKey: ['me'] })]);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    });

  // US25 — confirmação de recebimento
  if (sent) {
    return (
      <Screen title="Denúncia registrada" back={false}>
        <View style={{ alignItems: 'center', paddingVertical: 20, gap: 10 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.greenTint, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={36} color={theme.colors.green} />
          </View>
          <T v="h2" center>
            Recebemos sua denúncia
          </T>
          <T v="body" center color={theme.colors.textSoft}>
            {sent.categoryLabel} na linha {sent.line?.code}
            {sent.stop ? ` · ${sent.stop.name}` : ''}
          </T>
          <Card style={{ alignSelf: 'stretch', alignItems: 'center', marginTop: 8 }}>
            <T v="caption">NÚMERO DE PROTOCOLO</T>
            <T v="h2" style={{ fontFamily: theme.font.mono, marginTop: 4 }} accessibilityLabel={`Protocolo ${sent.protocol}`}>
              {sent.protocol}
            </T>
            <T v="small" center style={{ marginTop: 6 }}>
              A confirmação também ficou nas suas notificações.
            </T>
          </Card>
        </View>
        <Button title="Ver denúncias da linha" icon="flag" onPress={() => router.replace(`/lines/${l.id}/reports`)} />
        <Button title="Voltar para a linha" variant="ghost" onPress={() => router.replace(`/lines/${l.id}`)} style={{ marginTop: 8 }} />
      </Screen>
    );
  }

  return (
    <Screen title="Denunciar problema" subtitle={`Linha ${l.code} · ${l.name}`}>
      <T v="label" style={{ marginBottom: 8 }}>
        O que aconteceu?
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {REPORT_CATEGORIES.map((c) => {
          const active = category === c.key;
          return (
            <Pressable
              key={c.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={c.label}
              onPress={() => setCategory(c.key)}
              style={{
                width: '48%',
                flexGrow: 1,
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
                gap: 8,
                borderColor: active ? theme.colors.red : theme.colors.border,
                backgroundColor: active ? theme.colors.redTint : theme.colors.surface,
              }}
            >
              <Icon name={c.icon} size={18} color={active ? theme.colors.redDeep : theme.colors.textSoft} />
              <T v="h3" style={{ fontSize: 13 }} color={active ? theme.colors.redDeep : theme.colors.text}>
                {c.label}
              </T>
            </Pressable>
          );
        })}
      </View>
      <T v="label" style={{ marginBottom: 8 }}>
        Em qual ponto? (opcional)
      </T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
        <Chip label="No ônibus / trajeto todo" active={stop === null} onPress={() => setStop(null)} />
        {l.stops.map((s) => (
          <Chip key={s.seq} label={s.name} active={stop === s.id} onPress={() => setStop(s.id)} />
        ))}
      </ScrollView>
      <TextArea
        label={needsText ? 'Descreva o problema' : 'Detalhes (opcional)'}
        value={text}
        onChangeText={setText}
        max={1000}
        placeholder="Ex.: ar-condicionado não funciona e uma porta trava ao abrir…"
      />
      {error && <ErrorNote message={error} />}
      <Button title="Enviar denúncia" icon="flag" variant="danger" onPress={submit} loading={busy} disabled={!category || (needsText && !text.trim())} />
      <T v="caption" center style={{ marginTop: 10 }}>
        Sua denúncia é anônima para os outros passageiros e você recebe um número de protocolo.
      </T>
    </Screen>
  );
}
