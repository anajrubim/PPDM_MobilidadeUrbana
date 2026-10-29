import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, apiSession } from './api';
import { forgetDeviceNotifications } from './notifications';
import { clearPersistedCache, queryClient } from './query';
import { secure } from './storage';
import type { User } from './types';

const TOKEN_KEY = 'dmr.token';
/** Nome/e-mail da conta, para abrir o app sem internet (US27). Não é segredo: o token fica à parte. */
const USER_KEY = 'dmr.user';

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
    // Remove o aparelho da conta enquanto o token ainda vale
    await forgetDeviceNotifications();
    apiSession.setToken(null);
    setUser(null);
    try {
      // O token sai primeiro: mesmo se o resto falhar, o app não volta logado nesta conta
      await secure.set(TOKEN_KEY, null);
      await secure.set(USER_KEY, null);
    } finally {
      // Nada da conta (favoritas, histórico, notificações, links de localização) fica no aparelho
      await clearPersistedCache().catch(() => undefined);
      await AsyncStorage.removeItem('dmr.share.urls').catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    apiSession.onUnauthorized(() => void signOut());
    void (async () => {
      const token = await secure.get(TOKEN_KEY);
      if (token) {
        apiSession.setToken(token);
        try {
          const me = await api.get<User>('/me');
          setUser(me);
          await secure.set(USER_KEY, JSON.stringify(me));
        } catch (e) {
          // 401 já faz signOut. Sem rede (US27): entra com a conta salva para mostrar os dados offline
          const offlineUser = (e as { status?: number }).status === 0 ? await secure.get(USER_KEY) : null;
          if (offlineUser) {
            try {
              setUser(JSON.parse(offlineUser) as User);
            } catch {
              apiSession.setToken(null);
            }
          } else apiSession.setToken(null);
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
    await secure.set(USER_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  // Nome trocado (US04): atualiza também a cópia usada offline
  const updateUser = useCallback((u: User) => {
    setUser(u);
    void secure.set(USER_KEY, JSON.stringify(u));
  }, []);

  const value = useMemo(() => ({ ready, user, signIn, signOut, setUser: updateUser }), [ready, user, signIn, signOut, updateUser]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fora do AppStateProvider');
  return v;
}
