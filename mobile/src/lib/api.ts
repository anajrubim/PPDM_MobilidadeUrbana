import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

/**
 * Endereço da API.
 * 1. EXPO_PUBLIC_API_URL, quando definido (ex.: servidor publicado ou https://localhost:3443).
 * 2. Navegador: o mesmo computador que serve a página, porta 3333 (3443 se a página estiver em HTTPS).
 * 3. Expo Go / build do Android Studio em modo debug: o computador que serve o JavaScript (Metro), porta 3333.
 * 4. APK sem Metro (release): 10.0.2.2:3333 — o "localhost" do PC visto de dentro do emulador.
 */
export function resolveApiUrl(opts: {
  env?: string | null;
  platform: string;
  location?: { protocol: string; hostname: string } | null;
  hostUri?: string | null;
  /** URL de onde o app nativo carregou o JavaScript (http://10.0.2.2:8081/... no debug; arquivo no release) */
  scriptUrl?: string | null;
}): string {
  if (opts.env) return opts.env.replace(/\/+$/, '');
  if (opts.platform === 'web' && opts.location) {
    const https = opts.location.protocol === 'https:';
    return `${https ? 'https' : 'http'}://${opts.location.hostname}:${https ? 3443 : 3333}`;
  }
  const fromScript = /^https?:\/\/([^/:]+)/.exec(opts.scriptUrl ?? '')?.[1];
  const host = opts.hostUri?.split(':')[0] || fromScript;
  return `http://${host || '10.0.2.2'}:3333`;
}

export const API_URL = resolveApiUrl({
  env: process.env.EXPO_PUBLIC_API_URL || (Constants.expoConfig?.extra?.apiUrl as string | undefined),
  platform: Platform.OS,
  location: typeof window !== 'undefined' && window.location ? window.location : null,
  hostUri: Constants.expoConfig?.hostUri,
  scriptUrl: (NativeModules.SourceCode as { scriptURL?: string } | undefined)?.scriptURL,
});

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: { field: string; message: string }[];
  constructor(status: number, code: string, message: string, details?: { field: string; message: string }[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const apiSession = {
  setToken: (t: string | null) => {
    token = t;
  },
  getToken: () => token,
  onUnauthorized: (fn: () => void) => {
    onUnauthorized = fn;
  },
};

const TIMEOUT_MS = 15_000;

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'network', `Sem conexão com o servidor (${API_URL}). Verifique se a API está rodando.`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Sessão expirada ou senha trocada em outro aparelho: volta para o login
    if (res.status === 401 && token) onUnauthorized?.();
    const e = json?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'error', e.message ?? `Erro ${res.status}`, e.details);
  }
  return json.data as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b ?? {}),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b ?? {}),
  del: <T>(p: string) => request<T>('DELETE', p),
};

/** Mensagem amigável para mostrar na tela. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const first = e.details?.[0];
    return first ? first.message : e.message;
  }
  return 'Algo deu errado. Tente novamente.';
}
