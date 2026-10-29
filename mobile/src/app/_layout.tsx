import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, useFonts } from '@expo-google-fonts/manrope';
import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NotificationsBridge } from '../components/NotificationsBridge';
import { OfflineBanner } from '../components/OfflineBanner';
import { AppStateProvider, useApp } from '../lib/app-state';
import { QueryProvider } from '../lib/query';
import { theme } from '../lib/theme';

// A splash fica até as fontes carregarem e a sessão salva ser conferida (sem "piscar" a tela de login)
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Telas abertas sem login (o link público de compartilhamento é da API, não do app). */
const PUBLIC_ROUTES = new Set(['login', 'register', 'forgot-password', 'reset-password', 'plan', 'lines', 'stops', 'live', '+not-found']);

function Navigator() {
  const { ready } = useApp();
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  // Sem as fontes (ex.: erro ao carregar) o app abre com a fonte do sistema em vez de travar na splash
  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready && fontsReady) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready, fontsReady]);

  // Sessão expirada (401) ou saída da conta em qualquer tela: volta para o login (só as telas públicas ficam)
  const { user } = useApp();
  const segments = useSegments();
  const first = segments[0] as string | undefined;
  const isPublic = !first || PUBLIC_ROUTES.has(first);
  useEffect(() => {
    if (ready && !user && !isPublic) router.replace('/login');
  }, [ready, user, isPublic]);

  if (!ready || !fontsReady) return null;
  return (
    <>
      <StatusBar style="auto" />
      <OfflineBanner />
      <NotificationsBridge />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg }, animation: 'slide_from_right' }} />
    </>
  );
}

/** Raiz do app: área segura, cache de dados (React Query, com persistência offline — US27) e sessão (US02). */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AppStateProvider>
          <Navigator />
        </AppStateProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
