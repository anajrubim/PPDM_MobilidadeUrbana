import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Icon, type IconName } from '../../components/Icon';
import { useApp } from '../../lib/app-state';
import { theme } from '../../lib/theme';

function tab(icon: IconName) {
  function TabIcon({ color }: { color: unknown }) {
    return <Icon name={icon} size={22} color={String(color)} />;
  }
  return TabIcon;
}

/** Abas principais. Sem login, volta para a tela de entrada. */
export default function TabsLayout() {
  const { user } = useApp();
  if (!user) return <Redirect href="/login" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textFaint,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontFamily: theme.font.bold, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Início', tabBarIcon: tab('home') }} />
      <Tabs.Screen name="lines" options={{ title: 'Linhas', tabBarIcon: tab('bus') }} />
      <Tabs.Screen name="map" options={{ title: 'Mapa', tabBarIcon: tab('map') }} />
      <Tabs.Screen name="stops" options={{ title: 'Paradas', tabBarIcon: tab('pin') }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: tab('user') }} />
    </Tabs>
  );
}
