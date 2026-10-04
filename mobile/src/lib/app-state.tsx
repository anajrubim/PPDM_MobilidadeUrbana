import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, apiSession } from './api';
import { queryClient } from './query';
import { secure } from './storage';
import type { User } from './types';

const TOKEN_KEY = 'dmr.token';

interface AppState {
  ready: boolean;
  user: User | null;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = createContext<AppState | null>(null);

/** Sessão do usuário (US02): token guardado com segurança e restaurado ao abrir o app. */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const signOut = useCallback(async () => {
    apiSession.setToken(null);
    setUser(null);
    queryClient.clear();
    await secure.set(TOKEN_KEY, null);
  }, []);

  useEffect(() => {
    apiSession.onUnauthorized(() => void signOut());
    void (async () => {
      const token = await secure.get(TOKEN_KEY);
      if (token) {
        apiSession.setToken(token);
        try {
          setUser(await api.get<User>('/me'));
        } catch {
          // 401 já faz signOut; sem rede, pede login de novo
          apiSession.setToken(null);
        }
      }
      setReady(true);
    })();
  }, [signOut]);

  const signIn = useCallback(async (token: string, u: User) => {
    // Nada da conta anterior pode aparecer para esta
    queryClient.clear();
    apiSession.setToken(token);
    await secure.set(TOKEN_KEY, token);
    setUser(u);
  }, []);

  const value = useMemo(() => ({ ready, user, signIn, signOut, setUser }), [ready, user, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fora do AppStateProvider');
  return v;
}
