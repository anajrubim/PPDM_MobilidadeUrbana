import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../components/Icon';
import { LineCard } from '../../components/LineCard';
import { Chip, Empty, ErrorNote, Loading, T } from '../../components/ui';
import { useToggleFavorite } from '../../lib/favorites';
import { SERVICE_LABEL } from '../../lib/format';
import { useApi } from '../../lib/query';
import { theme } from '../../lib/theme';
import type { LineSummary, ServiceType } from '../../lib/types';

type Filter = 'all' | 'favorites' | ServiceType;

/** US05 — todas as linhas; US06 — busca por número ou nome enquanto digita; US11 — favoritar. */
export default function Lines() {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const toggle = useToggleFavorite();

  // Espera 250 ms depois da última tecla: filtra enquanto digita sem uma requisição por letra
  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(id);
  }, [text]);

  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (filter !== 'all' && filter !== 'favorites') params.set('serviceType', filter);
  const lines = useApi<LineSummary[]>(`/lines${params.toString() ? `?${params.toString()}` : ''}`);
  const data = (lines.data ?? []).filter((l) => filter !== 'favorites' || l.isFavorite);

  const renderItem = useCallback(
    ({ item }: { item: LineSummary }) => <LineCard line={item} onToggleFavorite={(l) => toggle.mutate(l)} />,
    [toggle],
  );

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'favorites', label: '★ Favoritas' },
    ...(Object.keys(SERVICE_LABEL) as ServiceType[]).filter((s) => s !== 'normal').map((s) => ({ key: s, label: SERVICE_LABEL[s] })),
  ];

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
        <T v="h2">Linhas de ônibus</T>
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
            accessibilityLabel="Buscar linha"
            value={text}
            onChangeText={setText}
            placeholder="Número ou nome da linha"
            placeholderTextColor={theme.colors.textFaint}
            returnKeyType="search"
            autoCorrect={false}
            maxLength={60}
            style={{ flex: 1, paddingVertical: 12, fontFamily: theme.font.medium, fontSize: 14.5, color: theme.colors.text }}
          />
          {text.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => setText('')} hitSlop={10}>
              <Icon name="close" size={18} color={theme.colors.textFaint} />
            </Pressable>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
          {filters.map((f) => (
            <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={data}
        keyExtractor={(l) => String(l.id)}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        ListHeaderComponent={
          <>
            <T v="label" style={{ marginBottom: 10 }}>
              {query ? `Resultados para “${query}”` : filter === 'favorites' ? 'Suas favoritas' : 'Todas as linhas'}
              {lines.data ? ` (${data.length})` : ''}
            </T>
            {lines.error && !lines.data && (
              <ErrorNote message="Não foi possível carregar as linhas." onRetry={() => void lines.refetch()} />
            )}
          </>
        }
        ListEmptyComponent={
          lines.isLoading ? (
            <Loading />
          ) : filter === 'favorites' ? (
            <Empty icon="star" title="Nenhuma favorita" text="Toque na estrela de uma linha para acessá-la rápido." />
          ) : (
            <Empty title="Nenhuma linha encontrada" text="Tente outro número ou nome." />
          )
        }
      />
    </View>
  );
}
