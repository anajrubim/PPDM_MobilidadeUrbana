import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { Card, Divider, Hero, Row, SectionTitle, T } from '../../components/ui';
import { API_URL } from '../../lib/api';
import { useApp } from '../../lib/app-state';
import { ask } from '../../lib/dialog';
import { initials } from '../../lib/format';
import { useApi } from '../../lib/query';
import { theme } from '../../lib/theme';
import type { Dashboard } from '../../lib/types';

/** Perfil: dados da conta, atalho para editar nome e senha (US04) e sair. */
export default function Profile() {
  const { user, signOut } = useApp();
  const dash = useApi<Dashboard>('/me/dashboard');

  const logout = () =>
    ask('Sair da conta?', 'Você precisará entrar novamente.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/login');
        },
      },
    ]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Hero style={{ alignItems: 'center', paddingBottom: 28 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: theme.colors.amber,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 10,
          }}
        >
          <T v="h1" color="#fff">
            {initials(user?.name ?? '?')}
          </T>
        </View>
        <T v="h2" color="#fff" numberOfLines={2} center>
          {user?.name}
        </T>
        <T v="small" color="#BFD3E0">
          {user?.email}
        </T>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
          {[
            { v: dash.data?.trips.total ?? 0, l: 'viagens' },
            { v: dash.data?.favorites.length ?? 0, l: 'favoritas' },
          ].map((s) => (
            <View
              key={s.l}
              style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 10, alignItems: 'center' }}
            >
              <T v="h2" color="#fff">
                {String(s.v)}
              </T>
              <T v="caption" color="#BFD3E0">
                {s.l}
              </T>
            </View>
          ))}
        </View>
      </Hero>
      <View style={{ padding: 20, gap: 6 }}>
        <SectionTitle>Conta</SectionTitle>
        <Card style={{ paddingVertical: 4 }}>
          <Row
            icon="pencil"
            title="Editar nome e senha"
            subtitle="Mantenha seu cadastro atualizado"
            onPress={() => router.push('/account')}
          />
          <Divider />
          <Row icon="mail" title="E-mail" subtitle={user?.email} />
          <Divider />
          <Row icon="clock" title="Conta criada em" subtitle={user ? new Date(user.createdAt).toLocaleDateString('pt-BR') : ''} />
        </Card>

        <SectionTitle>Sobre</SectionTitle>
        <Card style={{ paddingVertical: 4 }}>
          <Row icon="shield" title="Conexão" subtitle={`API: ${API_URL}`} />
          <Divider />
          <Row icon="file" title="Versão" subtitle="0.1.0 — Sprint 1" />
        </Card>

        <Pressable accessibilityRole="button" onPress={logout} style={{ padding: 18, alignItems: 'center' }}>
          <T v="h3" color={theme.colors.red}>
            Sair da conta
          </T>
        </Pressable>
      </View>
    </ScrollView>
  );
}
