import { api, ApiError, apiSession, errorText, request, resolveApiUrl } from '../api';

describe('endereço da API', () => {
  it('usa EXPO_PUBLIC_API_URL quando definido', () => {
    expect(resolveApiUrl({ env: 'https://api.exemplo.com/', platform: 'android' })).toBe('https://api.exemplo.com');
  });
  it('no navegador usa o mesmo host da página (HTTP 3333 / HTTPS 3443)', () => {
    expect(resolveApiUrl({ platform: 'web', location: { protocol: 'http:', hostname: 'localhost' } })).toBe('http://localhost:3333');
    expect(resolveApiUrl({ platform: 'web', location: { protocol: 'https:', hostname: '192.168.0.5' } })).toBe('https://192.168.0.5:3443');
  });
  it('no Expo Go usa o IP do computador que roda o Metro', () => {
    expect(resolveApiUrl({ platform: 'android', hostUri: '192.168.0.10:8081' })).toBe('http://192.168.0.10:3333');
    expect(resolveApiUrl({ platform: 'android', hostUri: null })).toBe('http://10.0.2.2:3333');
  });
  it('no build do Android Studio usa o host do Metro (debug) ou 10.0.2.2 (APK release)', () => {
    expect(resolveApiUrl({ platform: 'android', scriptUrl: 'http://10.0.2.2:8081/index.bundle?platform=android' })).toBe('http://10.0.2.2:3333');
    expect(resolveApiUrl({ platform: 'android', scriptUrl: 'http://localhost:8081/index.bundle' })).toBe('http://localhost:3333');
    expect(resolveApiUrl({ platform: 'android', scriptUrl: 'assets://index.android.bundle' })).toBe('http://10.0.2.2:3333');
  });
});

describe('cliente HTTP', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    apiSession.setToken(null);
  });
  const reply = (status: number, body?: unknown) => jest.fn().mockResolvedValue({ status, ok: status < 400, json: async () => body });

  it('envia o token e devolve data', async () => {
    const f = reply(200, { data: { ok: 1 } });
    globalThis.fetch = f as unknown as typeof fetch;
    apiSession.setToken('abc');
    await expect(api.post('/x', { a: 1 })).resolves.toEqual({ ok: 1 });
    const [, init] = f.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer abc');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });

  it('204 vira undefined', async () => {
    globalThis.fetch = reply(204) as unknown as typeof fetch;
    await expect(api.del('/x')).resolves.toBeUndefined();
  });

  it('erro da API vira ApiError com a mensagem; 401 com sessão desloga', async () => {
    const onUnauth = jest.fn();
    apiSession.onUnauthorized(onUnauth);
    apiSession.setToken('velho');
    globalThis.fetch = reply(401, { error: { code: 'unauthorized', message: 'Sessão inválida' } }) as unknown as typeof fetch;
    const err = (await request('GET', '/me').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(onUnauth).toHaveBeenCalled();
  });

  it('sem rede: mensagem clara', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
    const err = (await api.get('/lines').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('network');
    expect(errorText(err)).toMatch(/Sem conexão com o servidor/);
  });

  it('errorText usa o primeiro detalhe de validação', () => {
    expect(errorText(new ApiError(422, 'validation_error', 'Dados inválidos', [{ field: 'email', message: 'E-mail inválido' }]))).toBe(
      'E-mail inválido',
    );
    expect(errorText(new ApiError(400, 'x', 'Link inválido'))).toBe('Link inválido');
    expect(errorText(new Error('qualquer'))).toBe('Algo deu errado. Tente novamente.');
  });
});
