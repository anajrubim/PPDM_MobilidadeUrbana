import { View } from 'react-native';
import { theme } from '../lib/theme';
import { Icon } from './Icon';
import { T } from './ui';

/** Marca do app no topo das telas de acesso. */
export function Brand() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 }}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: theme.colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="bus" size={24} color="#fff" />
      </View>
      <View>
        <T v="h3" style={{ fontSize: 16 }}>
          Mobilidade Urbana
        </T>
        <T v="caption">Linhas, paradas e horários</T>
      </View>
    </View>
  );
}
