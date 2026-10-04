import { useMutation } from '@tanstack/react-query';
import { api, errorText } from './api';
import { notify } from './dialog';
import { queryClient } from './query';
import type { LineSummary } from './types';

/** Marca/desmarca a linha em todas as listas já carregadas (resposta imediata na tela). */
export function patchCachedLines(lineId: number, isFavorite: boolean) {
  const patch = (l: LineSummary) => (l.id === lineId ? { ...l, isFavorite } : l);
  queryClient.setQueriesData<unknown>({ queryKey: ['lines'] }, (old: unknown) => {
    if (Array.isArray(old)) return (old as LineSummary[]).map(patch);
    if (old && typeof old === 'object' && 'id' in old) return patch(old as LineSummary);
    return old;
  });
}

/** US11 — favoritar/desfavoritar uma linha. Atualiza a tela na hora e desfaz se a API recusar. */
export function useToggleFavorite() {
  return useMutation({
    mutationFn: async (line: Pick<LineSummary, 'id' | 'isFavorite'>) => {
      const add = !line.isFavorite;
      patchCachedLines(line.id, add);
      if (add) await api.put(`/me/favorites/${line.id}`);
      else await api.del(`/me/favorites/${line.id}`);
    },
    onError: (e, line) => {
      patchCachedLines(line.id, line.isFavorite);
      notify('Não foi possível atualizar a favorita', errorText(e));
    },
    // Recarrega dashboard, favoritas e as listas de linhas: vários toques rápidos terminam no estado do servidor
    onSettled: () =>
      Promise.all([queryClient.invalidateQueries({ queryKey: ['me'] }), queryClient.invalidateQueries({ queryKey: ['lines'] })]),
  });
}
