import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { network, useOnline } from '../lib/network';
import { queryClient } from '../lib/query';
import { theme } from '../lib/theme';
import { Icon } from './Icon';
import { T } from './ui';

/** A cada quantos segundos, sem conexão, testa se a API voltou. */
const RECHECK_MS = 15_000;

/** US27 — faixa "sem conexão"; testa a volta da conexão e atualiza tudo quando ela volta. */
export function OfflineBanner() {
  const online = useOnline();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (online) return;
    const ping = () => void api.get('/health').catch(() => undefined);
    const id = setInterval(ping, RECHECK_MS);
    return () => clearInterval(id);
  }, [online]);

  // Voltou a conexão: busca de novo o que estava sendo mostrado do cache
  useEffect(() => network.subscribe(() => {
    if (network.isOnline()) void queryClient.invalidateQueries();
  }), []);

  if (online) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        zIndex: 50,
        // Embaixo, acima da barra de abas: no topo cobriria o botão "Voltar" dos cabeçalhos
        bottom: insets.bottom + 76,
        left: 12,
        right: 12,
        backgroundColor: theme.colors.text,
        borderRadius: 12,
        paddingVertical: 8,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        opacity: 0.94,
      }}
    >
      <Icon name="wifioff" size={16} color="#fff" />
      <T v="small" color="#fff" style={{ flex: 1 }}>
        Sem conexão — mostrando os dados salvos no aparelho
      </T>
      <Pressable accessibilityRole="button" accessibilityLabel="Tentar reconectar" hitSlop={8} onPress={() => void api.get('/health').catch(() => undefined)}>
        <T v="label" color="#9FD0EE">
          Tentar
        </T>
      </Pressable>
    </View>
  );
}
