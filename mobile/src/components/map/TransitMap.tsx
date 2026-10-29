import { memo, useCallback, useEffect, useRef } from 'react';
import { Linking, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { theme } from '../../lib/theme';
import { mapHtml } from './html';
import { LocateButton } from './LocateButton';
import { useMapState } from './state';
import type { MapCommand, MapEvent, TransitMapProps } from './types';

/**
 * Mapa no Android/iOS (US07, US10): Leaflet numa WebView — funciona no Expo Go, sem chave do Google.
 */
function TransitMapView(props: TransitMapProps) {
  const { height = 300, onPointPress, showLocateButton, onTileStats, clearTilesKey } = props;
  const ref = useRef<WebView>(null);
  const ready = useRef(false);
  const state = useMapState(props);
  // Sempre a função mais recente, sem depender de o pai memorizar o callback
  const handlers = useRef({ onPointPress, onTileStats });
  useEffect(() => {
    handlers.current = { onPointPress, onTileStats };
  });

  const post = useCallback((cmd: MapCommand) => {
    ref.current?.injectJavaScript(`window.__mu && window.__mu(${JSON.stringify(cmd)}); true;`);
  }, []);

  useEffect(() => {
    if (ready.current) post({ type: 'state', state });
  }, [state, post]);

  useEffect(() => {
    if (clearTilesKey && ready.current) post({ type: 'clearTiles' });
  }, [clearTilesKey, post]);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: MapEvent;
    try {
      msg = JSON.parse(e.nativeEvent.data) as MapEvent;
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      ready.current = true;
      post({ type: 'state', state });
    } else if (msg.type === 'point') handlers.current.onPointPress?.(msg.id);
    else if (msg.type === 'tileStats') handlers.current.onTileStats?.({ cached: msg.cached, network: msg.network });
  };

  return (
    <View style={{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: theme.colors.tint }} accessibilityLabel="Mapa">
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: mapHtml(), baseUrl: 'https://localhost/' }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        // US28 — reaproveita o cache HTTP da WebView (além do cache de tiles da página): menos dados móveis
        cacheEnabled
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        setSupportMultipleWindows={false}
        // Links da atribuição (© OpenStreetMap) abrem no navegador: a WebView continua no mapa
        onShouldStartLoadWithRequest={(r) => {
          if (/^(about:|data:|https:\/\/localhost\/?)/.test(r.url)) return true;
          void Linking.openURL(r.url).catch(() => undefined);
          return false;
        }}
        style={{ backgroundColor: 'transparent' }}
      />
      {showLocateButton && props.user && <LocateButton onPress={() => post({ type: 'locate' })} />}
    </View>
  );
}

export const TransitMap = memo(TransitMapView);
