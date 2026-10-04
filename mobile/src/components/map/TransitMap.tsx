import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { theme } from '../../lib/theme';
import { mapHtml } from './html';
import { LocateButton } from './LocateButton';
import { toMapState } from './state';
import type { MapCommand, MapEvent, TransitMapProps } from './types';

/**
 * Mapa no Android/iOS (US07, US10): Leaflet numa WebView — funciona no Expo Go, sem chave do Google.
 */
function TransitMapView(props: TransitMapProps) {
  const { height = 300, onPointPress, showLocateButton } = props;
  const ref = useRef<WebView>(null);
  const ready = useRef(false);
  const state = useMemo(() => toMapState(props), [props]);

  const post = useCallback((cmd: MapCommand) => {
    ref.current?.injectJavaScript(`window.__mu && window.__mu(${JSON.stringify(cmd)}); true;`);
  }, []);

  useEffect(() => {
    if (ready.current) post({ type: 'state', state });
  }, [state, post]);

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
    } else if (msg.type === 'point') onPointPress?.(msg.id);
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
        setSupportMultipleWindows={false}
        style={{ backgroundColor: 'transparent' }}
      />
      {showLocateButton && props.user && <LocateButton onPress={() => post({ type: 'locate' })} />}
    </View>
  );
}

export const TransitMap = memo(TransitMapView);
