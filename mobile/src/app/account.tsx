import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Button, ErrorNote, Field, Screen, SectionTitle, SuccessNote, T } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useApp } from '../lib/app-state';
import { useSingleFlight } from '../lib/single-flight';
import type { Session, User } from '../lib/types';
import { cleanName, LIMITS, nameError, passwordError } from '../lib/validation';

/** US04 — editar nome e senha. */
export default function Account() {
  const { user, setUser, signIn } = useApp();
  const [name, setName] = useState(user?.name ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'name' | 'pwd' | null>(null);
  const once = useSingleFlight();

  // Sessão expirou (ou abriu o endereço direto sem login): volta para a entrada
  if (!user) return <Redirect href="/login" />;

  const fail = (message: string) => {
    setMsg(null);
    setError(message);
  };

  const run = (key: 'name' | 'pwd', fn: () => Promise<void>) =>
    void once(async () => {
      setBusy(key);
      setMsg(null);
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(null);
      }
    });

  const saveName = () => {
    const invalid = nameError(name);
    if (invalid) return fail(invalid);
    run('name', async () => {
      const u = await api.patch<User>('/me', { name: cleanName(name) });
      setUser(u);
      setName(u.name);
      setMsg('Nome atualizado.');
    });
  };

  const savePassword = () => {
    if (next !== confirm) return fail('As senhas novas não conferem.');
    const invalid = passwordError(next);
    if (invalid) return fail(`Nova senha: ${invalid.toLowerCase()}.`);
    run('pwd', async () => {
      const r = await api.post<Session>('/me/password', { currentPassword: current, newPassword: next });
      // A troca encerra as sessões antigas; esta continua com o token novo
      await signIn(r.token, r.user);
      setCurrent('');
      setNext('');
      setConfirm('');
      setMsg('Senha alterada. Outros aparelhos precisarão entrar de novo.');
    });
  };

  return (
    <Screen title="Editar nome e senha">
      {msg && <SuccessNote message={msg} />}
      {error && <ErrorNote message={error} />}

      <SectionTitle>Nome</SectionTitle>
      <Field label="Nome completo" icon="user" value={name} onChangeText={setName} autoComplete="name" maxLength={LIMITS.name} />
      <Button
        title="Salvar nome"
        variant="secondary"
        loading={busy === 'name'}
        disabled={!cleanName(name) || cleanName(name) === user.name}
        onPress={saveName}
      />

      <SectionTitle>Senha</SectionTitle>
      <Field
        label="Senha atual"
        icon="lock"
        value={current}
        onChangeText={setCurrent}
        secureTextEntry
        maxLength={72}
        autoComplete="current-password"
      />
      <Field
        label="Nova senha"
        icon="lock"
        value={next}
        onChangeText={setNext}
        secureTextEntry
        maxLength={72}
        autoComplete="new-password"
        placeholder="8+ caracteres, com letras e números"
      />
      <Field
        label="Confirme a nova senha"
        icon="lock"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        maxLength={72}
        autoComplete="new-password"
      />
      <Button
        title="Trocar senha"
        variant="secondary"
        loading={busy === 'pwd'}
        disabled={!current || next.length < 8 || !confirm}
        onPress={savePassword}
      />
      <T v="caption" style={{ marginTop: 16 }} center>
        Sua senha é guardada apenas como hash (bcrypt) no servidor.
      </T>
    </Screen>
  );
}
