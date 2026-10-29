import { useSyncExternalStore } from 'react';

/**
 * US27 — estado da conexão com a API, deduzido das próprias requisições (sem biblioteca nativa extra):
 * uma falha de rede marca "offline"; qualquer resposta do servidor marca "online".
 */
type Listener = () => void;

let online = true;
let since: number | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export const network = {
  isOnline: () => online,
  /** Desde quando está sem conexão (ms), ou null. */
  offlineSince: () => since,
  reportSuccess() {
    if (!online) {
      online = true;
      since = null;
      emit();
    }
  },
  reportFailure(now = Date.now()) {
    if (online) {
      online = false;
      since = now;
      emit();
    }
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** Só para testes. */
  reset() {
    online = true;
    since = null;
    emit();
  },
};

export function useOnline(): boolean {
  return useSyncExternalStore(network.subscribe, network.isOnline, network.isOnline);
}
