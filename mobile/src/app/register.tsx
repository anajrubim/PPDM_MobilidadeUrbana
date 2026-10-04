import { Link, Redirect, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Brand } from '../components/Brand';
import { Button, ErrorNote, Field, T } from '../components/ui';
import { api, ApiError, errorText } from '../lib/api';
import { useApp } from '../lib/app-state';
import { theme } from '../lib/theme';
import type { Session } from '../lib/types';
import { cleanName, LIMITS, validateRegistration } from '../lib/validation';
import { useSingleFlight } from '../lib/single-flight';

/** US01 — cadastro com nome, e-mail e senha. */
export default function Register() {
  const { signIn, user } = useApp();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<ReturnType<typeof validateRegistration>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const once = useSingleFlight();
  const submit = () =>
    once(async () => {
      const v = validateRegistration(form);
      setErrors(v);
      if (Object.keys(v).length) return;
      setBusy(true);
      setError(null);
      try {
        const r = await api.post<Session>('/auth/register', { ...form, name: cleanName(form.name), email: form.email.trim() });
        await signIn(r.token, r.user);
        router.replace('/home');
      } catch (e) {
        if (e instanceof ApiError && e.code === 'email_taken') setErrors({ email: 'Este e-mail já tem conta' });
        else setError(errorText(e));
      } finally {
        setBusy(false);
      }
    });

  // Já está logado (ex.: voltou pelo navegador): vai para o início
  if (user) return <Redirect href="/home" />;

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 40 }} keyboardShouldPersistTaps="handled">
        <Brand />
        <T v="h1" style={{ fontSize: 28 }}>
          Criar conta
        </T>
        <T v="body" color={theme.colors.textSoft} style={{ marginTop: 6, marginBottom: 28 }}>
          Leva menos de um minuto.
        </T>
        {error && <ErrorNote message={error} />}
        <Field
          label="Nome completo"
          icon="user"
          value={form.name}
          onChangeText={set('name')}
          error={errors.name}
          autoComplete="name"
          maxLength={LIMITS.name}
        />
        <Field
          label="E-mail"
          icon="mail"
          value={form.email}
          onChangeText={set('email')}
          error={errors.email}
          keyboardType="email-address"
          maxLength={254}
          autoCapitalize="none"
          autoComplete="email"
        />
        <Field
          label="Senha"
          icon="lock"
          value={form.password}
          onChangeText={set('password')}
          error={errors.password}
          secureTextEntry
          maxLength={72}
          autoComplete="new-password"
          onSubmitEditing={submit}
        />
        <T v="small" style={{ marginBottom: 20 }}>
          A senha precisa ter 8 ou mais caracteres, com letras e números.
        </T>
        <Button title="Criar minha conta" onPress={submit} loading={busy} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 24 }}>
          <T v="small">Já tem conta?</T>
          <Link href="/login">
            <T v="label" color={theme.colors.primary}>
              Entrar
            </T>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
