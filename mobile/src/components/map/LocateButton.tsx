import { Pressable } from 'react-native';
import { theme } from '../../lib/theme';
import { Icon } from '../Icon';

/** US10 — volta o mapa para a posição atual. */
export function LocateButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Centralizar na minha localização"
      onPress={onPress}
      style={{
        position: 'absolute',
        right: 10,
        bottom: 28,
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.2)',
        elevation: 4,
      }}
    >
      <Icon name="target" size={22} color={theme.colors.primary} />
    </Pressable>
  );
}
