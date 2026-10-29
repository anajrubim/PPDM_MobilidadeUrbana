import { network } from '../network';
import { downloadForOffline, forgetOfflineDownload, offlineSavedAt, OFFLINE_PATHS } from '../offline';
import { cached, clearPersistedCache, queryClient } from '../query';

const reply = (data: unknown) => ({ status: 200, ok: true, json: async () => ({ data }) });

describe('US27 — baixar a rede para usar offline', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    network.reset();
  });

  it('salva linhas, paradas e o detalhe de cada uma com as mesmas chaves das telas', async () => {
    const calls: string[] = [];
    globalThis.fetch = jest.fn(async (url: string) => {
      const p = url.split('/api/v1')[1]!;
      calls.push(p);
      if (p === OFFLINE_PATHS.lines) return reply([{ id: 1 }, { id: 2 }]);
      if (p === OFFLINE_PATHS.stops) return reply([{ id: 10 }]);
      return reply({ path: p });
    }) as never;
    const progress: number[] = [];
    const r = await downloadForOffline((p) => progress.push(p.done));
    expect(r).toEqual({ lines: 2, stops: 1 });
    expect(calls).toEqual(expect.arrayContaining(['/lines', '/stops?sort=name&limit=300', '/lines/1', '/lines/2', '/stops/10']));
    expect(progress.at(-1)).toBe(3);
    expect(cached(OFFLINE_PATHS.line(2))).toEqual({ path: '/lines/2' });
    expect(cached(OFFLINE_PATHS.stop(10))).toEqual({ path: '/stops/10' });
    expect(await offlineSavedAt()).toEqual(expect.any(String));

    await clearPersistedCache();
    await forgetOfflineDownload();
    expect(cached(OFFLINE_PATHS.lines)).toBeUndefined();
    expect(await offlineSavedAt()).toBeNull();
  });

  it('sem conexão não fica tentando de novo; erros de validação também não', () => {
    const retry = queryClient.getDefaultOptions().queries!.retry as (n: number, e: unknown) => boolean;
    expect(retry(0, { status: 0 })).toBe(true);
    network.reportFailure();
    expect(retry(0, { status: 0 })).toBe(false);
    expect(retry(0, { status: 500 })).toBe(true);
    expect(retry(2, { status: 500 })).toBe(false);
    expect(retry(0, { status: 404 })).toBe(false);
    expect(retry(0, { status: 422 })).toBe(false);
  });
});
