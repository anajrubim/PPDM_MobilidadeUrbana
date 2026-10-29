import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, ErrorNote, Loading, Screen, Stars, SuccessNote, T, TextArea } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { ask, notify } from '../../../lib/dialog';
import { ratingLabel, timeAgo } from '../../../lib/format';
import { queryClient, useApi } from '../../../lib/query';
import { useSingleFlight } from '../../../lib/single-flight';
import { theme } from '../../../lib/theme';
import type { LineRatings } from '../../../lib/types';

const SCORE_TEXT = ['', 'Muito ruim', 'Ruim', 'Regular', 'Boa', 'Excelente'];

/** US21 — avaliar a linha (nota + comentário); US22 — média, distribuição e comentários de outros passageiros. */
export default function RateLine() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useApi<LineRatings>(`/lines/${id}/ratings`);
  // Já avaliou: começa com a avaliação anterior (avaliar de novo substitui)
  const [draft, setDraft] = useState<{ score: number; comment: string } | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const once = useSingleFlight();
  const d = data.data;
  const score = draft?.score ?? d?.mine?.score ?? 0;
  const comment = draft?.comment ?? d?.mine?.comment ?? '';
  const setScore = (v: number) => setDraft({ score: v, comment });
  const setComment = (v: string) => setDraft({ score, comment: v });

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['lines'] }), queryClient.invalidateQueries({ queryKey: ['me'] })]);

  const send = () =>
    once(async () => {
      if (!score) return;
      setBusy(true);
      setError(null);
      try {
        await api.put(`/lines/${id}/rating`, { score, comment: comment.trim() || null });
        setDone(true);
        await refresh();
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    });

  const remove = () =>
    ask('Apagar sua avaliação?', 'Ela deixa de contar na média da linha.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.del(`/lines/${id}/rating`);
            setDraft({ score: 0, comment: '' });
          } catch (e) {
            // Não finge que apagou: a avaliação continua no servidor
            notify('Não foi possível apagar a avaliação', errorText(e));
            return;
          }
          await refresh();
        },
      },
    ]);

  if (!d) return <Screen title="Avaliar linha">{data.isLoading ? <Loading /> : <ErrorNote message="Linha não encontrada ou sem conexão." onRetry={() => void data.refetch()} />}</Screen>;
  const total = d.summary.count || 1;

  return (
    <Screen title={`Avaliar linha ${d.line.code}`} subtitle={d.line.name}>
      <Card style={{ marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          <View style={{ alignItems: 'center' }}>
            <T v="h1" color={theme.colors.blueDeep} style={{ fontFamily: theme.font.mono, fontSize: 30 }}>
              {d.summary.average != null ? ratingLabel(d.summary.average) : '—'}
            </T>
            <Stars value={d.summary.average ?? 0} size={13} />
            <T v="caption" style={{ marginTop: 3 }}>
              {d.summary.count === 1 ? '1 avaliação' : `${d.summary.count} avaliações`}
            </T>
          </View>
          {/* US22 — distribuição das notas */}
          <View style={{ flex: 1, gap: 3 }}>
            {([5, 4, 3, 2, 1] as const).map((n) => (
              <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <T v="caption" style={{ width: 10 }}>
                  {n}
                </T>
                <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
                  <View style={{ width: `${(d.summary.distribution[n] / total) * 100}%`, height: 6, backgroundColor: theme.colors.gold }} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </Card>

      {done ? (
        <SuccessNote message="Obrigado! Sua avaliação foi registrada e já conta na média da linha." />
      ) : (
        <>
          <T v="h3" center>
            Como foi sua viagem nesta linha?
          </T>
          <View style={{ alignItems: 'center', marginVertical: 14, gap: 6 }}>
            <Stars value={score} onChange={setScore} size={34} />
            <T v="small">{SCORE_TEXT[score] || 'Toque nas estrelas'}</T>
          </View>
          <TextArea label="Comentário (opcional)" value={comment} onChangeText={setComment} max={500} placeholder="Ex.: pontual, mas bem cheio no horário de pico…" />
          {error && <ErrorNote message={error} />}
          <Button title={d.mine ? 'Atualizar avaliação' : 'Enviar avaliação'} icon="star" onPress={send} loading={busy} disabled={!score} />
          {d.mine && <Button title="Apagar minha avaliação" variant="ghost" onPress={remove} style={{ marginTop: 6 }} />}
        </>
      )}

      <T v="label" style={{ marginTop: 22, marginBottom: 8 }}>
        O que os passageiros dizem
      </T>
      {d.items.length === 0 && <T v="small">Ainda não há comentários sobre esta linha.</T>}
      {d.items.map((r, i) => (
        <Card key={`${r.author}-${i}`} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Stars value={r.score} size={13} />
            <T v="caption">
              {r.author}
              {r.mine ? ' (você)' : ''} · {timeAgo(r.updatedAt)}
            </T>
          </View>
          <T v="body">{r.comment}</T>
        </Card>
      ))}
    </Screen>
  );
}
