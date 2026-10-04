import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider, useApp } from '../lib/app-state';
import { QueryProvider } from '../lib/query';
import { theme } from '../lib/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
// Navegador: idioma da página (leitores de tela e tradutor automático)
if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.lang = 'pt-BR';

function Root() {
  const { ready } = useApp();
  const [fontsLoaded] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });

  useEffect(() => {
    if (ready && fontsLoaded) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready, fontsLoaded]);

  if (!ready || !fontsLoaded) return null;
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg }, animation: 'slide_from_right' }} />
    </>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AppStateProvider>
          <Root />
        </AppStateProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
