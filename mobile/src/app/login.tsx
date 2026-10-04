import { Link, Redirect, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Brand } from '../components/Brand';
import { Button, ErrorNote, Field, T } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useApp } from '../lib/app-state';
import { theme } from '../lib/theme';
import type { Session } from '../lib/types';
import { useSingleFlight } from '../lib/single-flight';

/** US02 — login com e-mail e senha. */
export default function Login() {
  const { signIn, user } = useApp();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const once = useSingleFlight();
  const submit = () =>
    once(async () => {
      if (!email || !password) return;
      setBusy(true);
      setError(null);
      try {
        const r = await api.post<Session>('/auth/login', { email: email.trim(), password });
        await signIn(r.token, r.user);
        router.replace('/home');
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    });

  // Já está logado (ex.: voltou pelo navegador): vai para o início
  if (user) return <Redirect href="/home" />;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 40, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Brand />
        <T v="h1" style={{ fontSize: 28 }}>
          Bem-vindo(a) de volta
        </T>
        <T v="body" color={theme.colors.textSoft} style={{ marginTop: 6, marginBottom: 28 }}>
          Entre para continuar sua viagem.
        </T>
        {error && <ErrorNote message={error} />}
        <Field
          label="E-mail"
          icon="mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          maxLength={254}
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <Field
          label="Senha"
          icon="lock"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          maxLength={72}
          autoComplete="password"
          textContentType="password"
          onSubmitEditing={submit}
        />
        <Link href="/forgot-password" asChild>
          <Pressable accessibilityRole="link" style={{ alignSelf: 'flex-end', marginBottom: 20 }} hitSlop={8}>
            <T v="label" color={theme.colors.primary}>
              Esqueci minha senha
            </T>
          </Pressable>
        </Link>
        <Button title="Entrar" onPress={submit} loading={busy} disabled={!email || !password} />
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 28 }}>
          <T v="small">Novo por aqui?</T>
          <Link href="/register">
            <T v="label" color={theme.colors.primary}>
              Criar conta
            </T>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
