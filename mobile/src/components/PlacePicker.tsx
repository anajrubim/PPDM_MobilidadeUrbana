import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useApi } from '../lib/query';
import { theme } from '../lib/theme';
import type { PlanPlace, StopSummary } from '../lib/types';
import { Icon } from './Icon';
import { T } from './ui';

/**
 * Escolha de origem/destino do planejador (US15): "Minha localização" ou um ponto de parada pelo nome.
 * (A rede de demonstração não tem geocodificação de endereços: os lugares são os pontos.)
 */
export function PlacePicker({
  label,
  value,
  onChange,
  here,
  dot,
  autoFocus,
}: {
  label: string;
  value: PlanPlace | null;
  onChange: (p: PlanPlace | null) => void;
  here?: { latitude: number; longitude: number } | null;
  dot: 'fill' | 'ring';
  autoFocus?: boolean;
}) {
  const [editing, setEditing] = useState(!!autoFocus && !value);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(id);
  }, [text]);
  const results = useApi<StopSummary[]>(editing && q.length >= 2 ? `/stops?q=${encodeURIComponent(q)}&sort=name&limit=8` : null, { keepPrevious: true });

  const pick = (p: PlanPlace) => {
    onChange(p);
    setEditing(false);
    setText('');
  };

  const dotView = (
    <View
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: theme.colors.primary,
        backgroundColor: dot === 'fill' ? theme.colors.primary : 'transparent',
      }}
    />
  );

  if (!editing) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value?.name ?? 'escolher'}`}
        onPress={() => setEditing(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 }}
      >
        {dotView}
        <View style={{ flex: 1 }}>
          <T v="caption">{label}</T>
          <T v="body" color={value ? theme.colors.text : theme.colors.textFaint} numberOfLines={1}>
            {value?.name ?? 'Escolher ponto ou minha localização'}
          </T>
        </View>
        <Icon name="search" size={16} color={theme.colors.textFaint} />
      </Pressable>
    );
  }

  return (
    <View style={{ paddingVertical: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {dotView}
        <TextInput
          accessibilityLabel={`Buscar ${label.toLowerCase()}`}
          autoFocus
          value={text}
          onChangeText={setText}
          placeholder="Digite o nome do ponto…"
          placeholderTextColor={theme.colors.textFaint}
          style={{ flex: 1, fontFamily: theme.font.medium, fontSize: 14.5, color: theme.colors.text, paddingVertical: 8 }}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Cancelar" hitSlop={8} onPress={() => setEditing(false)}>
          <Icon name="close" size={18} color={theme.colors.textFaint} />
        </Pressable>
      </View>
      {here && (
        <Option icon="target" title="Minha localização" subtitle="Usar o GPS" onPress={() => pick({ name: 'Minha localização', lat: here.latitude, lng: here.longitude })} />
      )}
      {results.data?.map((s) => (
        <Option
          key={s.id}
          icon="pin"
          title={s.name}
          subtitle={s.lines.length ? `Linhas ${s.lines.join(', ')}` : 'Sem linhas ativas'}
          onPress={() => pick({ stopId: s.id, name: s.name, lat: s.lat, lng: s.lng })}
        />
      ))}
      {q.length >= 2 && results.data?.length === 0 && (
        <T v="small" style={{ paddingVertical: 8 }}>
          Nenhum ponto com esse nome.
        </T>
      )}
      {q.length < 2 && (
        <T v="caption" style={{ paddingVertical: 6 }}>
          Digite ao menos 2 letras (ex.: “Terminal”, “Shopping”).
        </T>
      )}
    </View>
  );
}

function Option({ icon, title, subtitle, onPress }: { icon: 'pin' | 'target'; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 9, paddingLeft: 20 }, pressed && { opacity: 0.6 }]}
    >
      <Icon name={icon} size={17} color={theme.colors.primary} />
      <View style={{ flex: 1 }}>
        <T v="h3" style={{ fontSize: 14 }} numberOfLines={1}>
          {title}
        </T>
        <T v="caption" numberOfLines={1}>
          {subtitle}
        </T>
      </View>
    </Pressable>
  );
}
