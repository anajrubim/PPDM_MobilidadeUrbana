import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../components/Icon';
import { Card, Chip, Empty, ErrorNote, Loading, T } from '../../components/ui';
import { formatDistance } from '../../lib/geo';
import { useCurrentLocation } from '../../lib/location';
import { useApi } from '../../lib/query';
import { theme } from '../../lib/theme';
import type { StopSummary } from '../../lib/types';

type Sort = 'distance' | 'name' | 'lines';

/** US08 — lista de pontos de parada: busca por nome e ordenação (perto de mim, A–Z, mais linhas). */
export default function Stops() {
  const insets = useSafeAreaInsets();
  const { position, status } = useCurrentLocation();
  const [sort, setSort] = useState<Sort>('distance');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(id);
  }, [text]);

  const effectiveSort = sort === 'distance' && !position ? 'name' : sort;
  const params = new URLSearchParams({ sort: effectiveSort, limit: '300' });
  if (q) params.set('q', q);
  if (position) {
    params.set('lat', position.latitude.toFixed(5));
    params.set('lng', position.longitude.toFixed(5));
  }
  const stops = useApi<StopSummary[]>(`/stops?${params.toString()}`);

  const renderItem = useCallback(
    ({ item: s }: { item: StopSummary }) => (
      <Card onPress={() => router.push(`/stops/${s.id}`)} accessibilityLabel={`Parada ${s.name}`} style={{ marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              backgroundColor: theme.colors.tint,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="pin" size={18} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <T v="h3" numberOfLines={1}>
              {s.name}
            </T>
            <T v="small" numberOfLines={1}>
              {s.code} · {s.lines.length ? `Linhas ${s.lines.join(', ')}` : 'Sem linhas ativas'}
            </T>
          </View>
          {s.distanceM != null && <T v="label">{formatDistance(s.distanceM)}</T>}
        </View>
      </Card>
    ),
    [],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 6,
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: 1,
        }}
      >
        <T v="h2">Pontos de parada</T>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: theme.colors.bg,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 12,
            paddingHorizontal: 12,
            marginTop: 12,
          }}
        >
          <Icon name="search" size={18} color={theme.colors.textFaint} />
          <TextInput
            accessibilityLabel="Buscar parada"
            value={text}
            onChangeText={setText}
            placeholder="Nome ou código do ponto"
            placeholderTextColor={theme.colors.textFaint}
            autoCorrect={false}
            maxLength={60}
            style={{ flex: 1, paddingVertical: 12, fontFamily: theme.font.medium, fontSize: 14.5, color: theme.colors.text }}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 12 }}>
          <Chip label="Perto de mim" icon="target" active={sort === 'distance'} onPress={() => setSort('distance')} />
          <Chip label="A–Z" active={sort === 'name'} onPress={() => setSort('name')} />
          <Chip label="Mais linhas" active={sort === 'lines'} onPress={() => setSort('lines')} />
        </View>
      </View>
      <FlatList
        data={stops.data ?? []}
        keyExtractor={(s) => String(s.id)}
        renderItem={renderItem}
        initialNumToRender={12}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        ListHeaderComponent={
          <>
            {sort === 'distance' && !position && (
              <T v="small" color={theme.colors.amberDeep} style={{ marginBottom: 10 }}>
                {status === 'denied' ? 'Sem permissão de localização: mostrando em ordem alfabética.' : 'Obtendo sua localização…'}
              </T>
            )}
            <T v="label" style={{ marginBottom: 10 }}>
              {stops.data ? `${stops.data.length} pontos` : ' '}
            </T>
            {stops.error && !stops.data && (
              <ErrorNote message="Não foi possível carregar os pontos." onRetry={() => void stops.refetch()} />
            )}
          </>
        }
        ListEmptyComponent={stops.isLoading ? <Loading /> : <Empty title="Nenhum ponto encontrado" />}
      />
    </View>
  );
}
