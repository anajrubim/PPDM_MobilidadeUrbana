import { createElement, memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { theme } from '../../lib/theme';
import { mapHtml } from './html';
import { LocateButton } from './LocateButton';
import { useMapState } from './state';
import type { MapCommand, MapEvent, TransitMapProps } from './types';

/**
 * Mapa no navegador (US07, US10): a mesma página Leaflet do celular, num iframe.
 */
function TransitMapView(props: TransitMapProps) {
  const { height = 300, onPointPress, showLocateButton, onTileStats, clearTilesKey } = props;
  const frame = useRef<HTMLIFrameElement | null>(null);
  const ready = useRef(false);
  const state = useMapState(props);
  const latest = useRef({ state, onPointPress, onTileStats });
  useEffect(() => {
    latest.current = { state, onPointPress, onTileStats };
  });

  const post = useCallback((cmd: MapCommand) => {
    frame.current?.contentWindow?.postMessage({ __mu: 'in', ...cmd }, '*');
  }, []);

  useEffect(() => {
    if (ready.current) post({ type: 'state', state });
  }, [state, post]);

  useEffect(() => {
    if (clearTilesKey && ready.current) post({ type: 'clearTiles' });
  }, [clearTilesKey, post]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const msg = e.data as MapEvent & { __mu?: string };
      if (!msg || msg.__mu !== 'out') return;
      if (msg.type === 'ready') {
        ready.current = true;
        post({ type: 'state', state: latest.current.state });
      } else if (msg.type === 'point') latest.current.onPointPress?.(msg.id);
      else if (msg.type === 'tileStats') latest.current.onTileStats?.({ cached: msg.cached, network: msg.network });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post]);

  const html = useMemo(() => mapHtml(), []);

  return (
    <View style={{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: theme.colors.tint }} accessibilityLabel="Mapa">
      {createElement('iframe', {
        ref: frame,
        srcDoc: html,
        title: 'Mapa',
        style: { border: 0, width: '100%', height: '100%' },
      })}
      {showLocateButton && props.user && <LocateButton onPress={() => post({ type: 'locate' })} />}
    </View>
  );
}

export const TransitMap = memo(TransitMapView);
