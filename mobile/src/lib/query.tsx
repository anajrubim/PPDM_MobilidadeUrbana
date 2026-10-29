import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, keepPreviousData, QueryClient, useQuery, type QueryKey } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { AppState, Platform } from 'react-native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import type { ReactNode } from 'react';
import { api } from './api';
import { network, useOnline } from './network';

/** Dados salvos para uso offline valem por 7 dias (US27). */
export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
/** Muda a cada versão que altera o formato das respostas: descarta o cache salvo da versão anterior. */
export const CACHE_BUSTER = '0.2.0';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Precisa ser ≥ maxAge da persistência, senão o cache salvo some da memória antes de ser usado offline
      gcTime: PERSIST_MAX_AGE,
      // Mostra o que está salvo na hora e atualiza pela rede quando der (US27)
      networkMode: 'offlineFirst',
      retry: (count, err) => {
        const status = (err as { status?: number }).status ?? 0;
        // Sem conexão: não fica insistindo (a tela já mostra os dados salvos)
        if (status === 0) return count < 1 && network.isOnline();
        return count < 2 && ![401, 403, 404, 409, 410, 422, 429].includes(status);
      },
    },
    mutations: { networkMode: 'online' },
  },
});

/**
 * O que fica salvo no aparelho: linhas, paradas e horários (US27), favoritas, dashboard, histórico e notificações.
 * Fica de fora o que só vale "agora": ônibus ao vivo, planejamento e compartilhamentos.
 */
export function isPersistable(key: QueryKey): boolean {
  const [root, second] = key as string[];
  if (key.some((k) => k === 'vehicles')) return false;
  // Buscas digitadas e consultas por posição geram chaves novas sem fim: não vão para o aparelho
  const path = String(key.at(-1) ?? '');
  if (/[?&](q|lat|lng)=/.test(path)) return false;
  if (root === 'lines' || root === 'stops' || root === 'service-alerts') return true;
  return root === 'me' && second !== 'shares';
}

// No celular, "app em primeiro plano" = foco: com o app em segundo plano as consultas periódicas param (A2)
if (Platform.OS !== 'web') {
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (s) => setFocused(s === 'active'));
    return () => sub.remove();
  });
}

export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'dmr.cache', throttleTime: 2000 });

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE,
        buster: CACHE_BUSTER,
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && isPersistable(q.queryKey) },
      }}
      // O que veio do aparelho aparece na hora, mas pode estar velho: busca de novo tudo o que está na tela
      onSuccess={() => void queryClient.invalidateQueries()}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

/** Apaga o cache salvo (sair da conta, "Limpar dados offline"). */
export async function clearPersistedCache(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}

/** Chave de cache derivada do caminho: ['me', 'dashboard', ...] → invalidar ['me'] atualiza tudo da conta. */
export const keyFor = (path: string) => path.split(/[/?]/).filter(Boolean).concat(path);

interface ApiOptions<T> {
  refetchInterval?: number | false;
  /** Sem conexão e sem dados salvos para esta chave: calcula algo útil a partir de outro cache. */
  fallback?: () => T | undefined;
  /** Ao trocar a chave (ex.: nova posição), mantém os dados anteriores na tela até chegar a resposta. */
  keepPrevious?: boolean;
}

function useApiCore<T>(path: string | null, opts: ApiOptions<T>, focused: boolean) {
  const online = useOnline();
  const q = useQuery({
    queryKey: path ? keyFor(path) : ['disabled'],
    queryFn: () => api.get<T>(path!),
    enabled: !!path,
    // Atualização periódica só com conexão e com a tela visível (telas de baixo da pilha ficam quietas)
    refetchInterval: online && focused ? opts.refetchInterval : false,
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
  });
  const fallbackData = q.data === undefined && !online && opts.fallback ? opts.fallback() : undefined;
  // Cópia (o resultado do React Query tem só getters, não dá para sobrescrever `data`)
  return {
    ...q,
    data: (q.data ?? fallbackData) as T | undefined,
    /** Dados vindos do que estava salvo (sem conexão agora). */
    offline: !online && (q.data !== undefined || fallbackData !== undefined),
    savedAt: q.dataUpdatedAt || null,
  };
}

/**
 * GET tipado para telas. `path = null` desliga a consulta.
 * Sem conexão, devolve os dados salvos; `fallback` calcula algo a partir de outro cache (ex.: busca de linhas
 * filtrada no aparelho). A atualização periódica só roda com a tela em foco.
 */
export function useApi<T>(path: string | null, opts: ApiOptions<T> = {}) {
  return useApiCore(path, opts, useIsFocused());
}

/** Igual a `useApi`, para componentes fora das telas (raiz do app), que não têm foco de navegação. */
export function useGlobalApi<T>(path: string | null, opts: ApiOptions<T> = {}) {
  return useApiCore(path, opts, true);
}

/** Lê do cache uma consulta já feita (sem ir à rede). */
export function cached<T>(path: string): T | undefined {
  return queryClient.getQueryData<T>(keyFor(path));
}

