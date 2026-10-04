import { patchCachedLines } from '../favorites';
import { queryClient } from '../query';
import type { LineSummary } from '../types';

const line = (id: number, isFavorite = false) => ({ id, code: String(id), isFavorite }) as LineSummary;

describe('US11 — favoritar atualiza a tela na hora', () => {
  afterEach(() => queryClient.clear());

  it('marca a linha em todas as listas e no detalhe em cache', () => {
    queryClient.setQueryData(['lines', '/lines'], [line(1), line(2)]);
    queryClient.setQueryData(['lines', '?q=1', '/lines?q=1'], [line(1)]);
    queryClient.setQueryData(['lines', '1', '/lines/1'], line(1));
    patchCachedLines(1, true);
    expect(queryClient.getQueryData<LineSummary[]>(['lines', '/lines'])!.map((l) => l.isFavorite)).toEqual([true, false]);
    expect(queryClient.getQueryData<LineSummary[]>(['lines', '?q=1', '/lines?q=1'])![0]!.isFavorite).toBe(true);
    expect(queryClient.getQueryData<LineSummary>(['lines', '1', '/lines/1'])!.isFavorite).toBe(true);
    patchCachedLines(1, false);
    expect(queryClient.getQueryData<LineSummary>(['lines', '1', '/lines/1'])!.isFavorite).toBe(false);
  });
});
