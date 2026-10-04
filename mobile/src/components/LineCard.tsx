import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SERVICE_LABEL } from '../lib/format';
import { theme as t } from '../lib/theme';
import type { LineSummary } from '../lib/types';
import { Icon } from './Icon';
import { Card, LineBadge, Pill, T } from './ui';

/** Cartão de linha usado na lista (US05/US06) e nas favoritas (US11). */
export function LineCard({ line, onToggleFavorite }: { line: LineSummary; onToggleFavorite?: (l: LineSummary) => void }) {
  return (
    // Abrir a linha e favoritar são dois botões lado a lado (botão dentro de botão é HTML inválido na web)
    <Card style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Linha ${line.code}, ${line.name}`}
          onPress={() => router.push(`/lines/${line.id}`)}
          style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }, pressed && { opacity: 0.7 }]}
        >
          <LineBadge code={line.code} color={line.color} />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="h3" numberOfLines={1}>
              {line.name}
            </T>
            <T v="small">
              {line.stopsCount} paradas · a cada {line.headwayMin} min · {line.firstDeparture}–{line.lastDeparture}
            </T>
            {(line.serviceType !== 'normal' || !line.operating) && (
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                {line.serviceType !== 'normal' && <Pill label={SERVICE_LABEL[line.serviceType]} tone="purple" />}
                {!line.operating && <Pill label="Fora de operação" tone="red" />}
              </View>
            )}
          </View>
        </Pressable>
        {onToggleFavorite && (line.operating || line.isFavorite) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={line.isFavorite ? `Remover ${line.code} dos favoritos` : `Favoritar ${line.code}`}
            hitSlop={10}
            onPress={() => onToggleFavorite(line)}
          >
            <Icon name={line.isFavorite ? 'starfill' : 'star'} size={22} color={line.isFavorite ? t.colors.gold : t.colors.textFaint} />
          </Pressable>
        )}
      </View>
    </Card>
  );
}
