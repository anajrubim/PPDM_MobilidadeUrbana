import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { Card, ErrorNote, Hero, LineBadge, Loading, SectionTitle, T } from '../../components/ui';
import { useApp } from '../../lib/app-state';
import { dayLabel, greeting, initials, minutesLabel } from '../../lib/format';
import { formatDistance } from '../../lib/geo';
import { useCurrentLocation } from '../../lib/location';
import { useApi } from '../../lib/query';
import { theme } from '../../lib/theme';
import type { Dashboard } from '../../lib/types';

/** US12 — dashboard: resumo das viagens, linhas favoritas e próximas partidas delas. */
export default function Home() {
  const { user } = useApp();
  const { position } = useCurrentLocation();
  const q = position ? `?lat=${position.latitude.toFixed(5)}&lng=${position.longitude.toFixed(5)}` : '';
  const dash = useApi<Dashboard>(`/me/dashboard${q}`, { refetchInterval: 60_000 });
  const d = dash.data;
  const month = d?.trips.last30Days;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView refreshControl={<RefreshControl refreshing={dash.isRefetching} onRefresh={() => void dash.refetch()} />}>
        <Hero>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <T v="caption" color="#BFD3E0" style={{ fontSize: 12 }}>
                {greeting()}
              </T>
              <T v="h2" color="#fff" style={{ fontSize: 22 }} numberOfLines={1}>
                {user?.name.split(' ')[0]}
              </T>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Abrir perfil" onPress={() => router.push('/profile')}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: theme.colors.amber,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <T v="h3" color="#fff">
                  {initials(user?.name ?? '?')}
                </T>
              </View>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="search"
            accessibilityLabel="Ir para a busca de linhas"
            onPress={() => router.push('/lines')}
            style={{
              marginTop: 16,
              backgroundColor: 'rgba(255,255,255,0.16)',
              borderColor: 'rgba(255,255,255,0.18)',
              borderWidth: 1,
              borderRadius: 12,
              padding: 13,
              flexDirection: 'row',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <Icon name="search" size={18} color="#E3EDF3" />
            <T v="body" color="#E3EDF3">
              Buscar linha por número ou nome
            </T>
          </Pressable>

          {/* Resumo de viagens (últimos 30 dias) */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }} accessibilityLabel="Resumo de viagens dos últimos 30 dias">
            {[
              { v: String(month?.trips ?? 0), l: 'viagens' },
              { v: minutesLabel(month?.minutes ?? 0).replace('agora', '0 min'), l: 'no ônibus' },
              { v: formatDistance(month?.distance ?? 0), l: 'percorridos' },
            ].map((s) => (
              <View
                key={s.l}
                style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 10, alignItems: 'center' }}
              >
                <T v="h3" color="#fff" style={{ fontSize: 17 }}>
                  {s.v}
                </T>
                <T v="caption" color="#BFD3E0">
                  {s.l}
                </T>
              </View>
            ))}
          </View>
          <T v="caption" color="#BFD3E0" style={{ marginTop: 8 }} center>
            Últimos 30 dias{d?.trips.mostUsedLine ? ` · linha mais usada: ${d.trips.mostUsedLine}` : ''}
          </T>
        </Hero>

        <View style={{ padding: 20, gap: 8 }}>
          {dash.isLoading && <Loading />}
          {dash.error && !d && <ErrorNote message="Não foi possível carregar o resumo." onRetry={() => void dash.refetch()} />}

          <SectionTitle action="ver linhas" onAction={() => router.push('/lines')}>
            Linhas favoritas
          </SectionTitle>
          {d?.favorites.length === 0 && (
            <Card onPress={() => router.push('/lines')} style={{ borderStyle: 'dashed' }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Icon name="star" size={20} color={theme.colors.gold} />
                <T v="body" style={{ flex: 1 }}>
                  Toque na estrela de uma linha para ela aparecer aqui.
                </T>
              </View>
            </Card>
          )}
          {d?.favorites.map((f) => {
            const next = d.nextDepartures.find((n) => n.line.id === f.id);
            return (
              <Card
                key={f.id}
                onPress={() => router.push(`/lines/${f.id}`)}
                accessibilityLabel={`Favorita ${f.code}`}
                style={{ marginBottom: 8 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <LineBadge code={f.code} color={f.color} size="lg" />
                  <View style={{ flex: 1 }}>
                    <T v="h3" numberOfLines={1}>
                      {f.name}
                    </T>
                    <T v="small" numberOfLines={1}>
                      {next ? `Ponto ${next.stop.name}` : f.operating ? 'Sem previsão' : 'Fora de operação'}
                    </T>
                  </View>
                  {next && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <T v="h2" color={next.inMin <= 3 ? theme.colors.green : theme.colors.primary}>
                        {next.inMin > 90 ? next.at : next.inMin <= 0 ? 'agora' : next.inMin}
                      </T>
                      {next.inMin > 0 && next.inMin <= 90 && <T v="caption">min</T>}
                    </View>
                  )}
                </View>
              </Card>
            );
          })}

          <SectionTitle>Viagens recentes</SectionTitle>
          {d && d.trips.recent.length === 0 && <T v="small">Nenhuma viagem ainda. Abra uma linha e toque em “Registrar viagem”.</T>}
          {d?.trips.recent.map((t) => (
            <Card key={t.id} onPress={t.lineId ? () => router.push(`/lines/${t.lineId}`) : undefined} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name="history" size={22} color={theme.colors.primary} />
                <View style={{ flex: 1 }}>
                  <T v="h3" numberOfLines={1}>
                    {t.originLabel} → {t.destLabel}
                  </T>
                  <T v="small">
                    {dayLabel(t.createdAt)} · Linha {t.lineCode} · {minutesLabel(t.durationMin)} · {formatDistance(t.distanceM)}
                  </T>
                </View>
              </View>
            </Card>
          ))}
          {d && d.trips.total > 0 && (
            <T v="caption" center style={{ marginTop: 4 }}>
              {d.trips.total === 1 ? '1 viagem registrada no total' : `${d.trips.total} viagens registradas no total`}
            </T>
          )}

          <SectionTitle>Atalhos</SectionTitle>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(
              [
                { icon: 'bus', label: 'Linhas', href: '/lines' },
                { icon: 'pin', label: 'Paradas', href: '/stops' },
                { icon: 'target', label: 'Onde estou', href: '/map' },
              ] as const
            ).map((s) => (
              <Pressable
                key={s.href}
                accessibilityRole="button"
                accessibilityLabel={s.label}
                onPress={() => router.push(s.href)}
                style={{ flex: 1, alignItems: 'center', gap: 6 }}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 15,
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={s.icon} size={22} color={theme.colors.primary} />
                </View>
                <T v="caption" color={theme.colors.textSoft}>
                  {s.label}
                </T>
              </Pressable>
            ))}
          </View>
          <T v="caption" center style={{ marginTop: 18 }}>
            Horários previstos pela programação das linhas.
          </T>
        </View>
      </ScrollView>
    </View>
  );
}
