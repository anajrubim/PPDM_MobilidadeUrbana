import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import type { LatLng } from './geo';

export type LocationStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'unavailable';

/**
 * US10 — localização atual pelo GPS (no navegador, pela API de geolocalização).
 * Com `watch`, acompanha o movimento. `retry()` pede a permissão de novo.
 */
export function useCurrentLocation(opts: { watch?: boolean } = {}) {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    void (async () => {
      setStatus('loading');
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          if (!cancelled) setStatus('denied');
          return;
        }
        // mayShowUserSettingsDialog: false — sem o aviso "precisão de local" do Google a cada tela; usa o GPS direto.
        // Se a leitura falhar (GPS lento/desligado), tenta a última posição conhecida antes de desistir.
        const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: false }).catch(
          async (err: unknown) => {
            const last = await Location.getLastKnownPositionAsync().catch(() => null);
            if (last) return last;
            throw err;
          },
        );
        if (cancelled) return;
        setPosition({ latitude: cur.coords.latitude, longitude: cur.coords.longitude });
        setStatus('granted');
        if (opts.watch) {
          sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10, mayShowUserSettingsDialog: false }, (p) =>
            setPosition({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
          );
        }
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [opts.watch, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { position, status, retry };
}
