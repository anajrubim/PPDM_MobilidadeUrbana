import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => count < 2 && ![401, 404, 422].includes((err as { status?: number }).status ?? 0),
    },
  },
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Chave de cache derivada do caminho: ['me', 'dashboard', ...] → invalidar ['me'] atualiza tudo da conta. */
export const keyFor = (path: string) => path.split(/[/?]/).filter(Boolean).concat(path);

/** GET tipado. `path = null` desliga a consulta. */
export function useApi<T>(path: string | null, opts: { refetchInterval?: number | false } = {}) {
  return useQuery({
    queryKey: path ? keyFor(path) : ['disabled'],
    queryFn: () => api.get<T>(path!),
    enabled: !!path,
    refetchInterval: opts.refetchInterval,
  });
}
