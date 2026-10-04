import { useCallback, useRef } from 'react';

/**
 * Evita envio duplo: enquanto a ação anterior não termina, novos toques são ignorados.
 * (O estado `busy` do React só desabilita o botão no próximo render — um duplo clique rápido passava.)
 */
export function useSingleFlight() {
  const running = useRef(false);
  return useCallback(async (fn: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    try {
      await fn();
    } finally {
      running.current = false;
    }
  }, []);
}
