import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Button, ErrorNote, Field, Screen, SuccessNote, T } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useSingleFlight } from '../lib/single-flight';
import { passwordError } from '../lib/validation';

/** US03 — aberto pelo link do e-mail: http://localhost:8081/reset-password?token=… (ou mobilidade://…) */
export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const once = useSingleFlight();
  const submit = () =>
    once(async () => {
      const invalid = passwordError(password);
      if (invalid) {
        setError(`Senha: ${invalid.toLowerCase()}.`);
        return;
      }
      if (password !== confirm) {
        setError('As senhas não conferem');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await api.post('/auth/reset-password', { token, password });
        setDone(true);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    });

  // O link do e-mail traz um token de 64 caracteres hexadecimais; qualquer outra coisa é link quebrado
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return (
      <Screen title="Nova senha">
        <ErrorNote message="Link inválido. Peça um novo link de recuperação." />
        <Button title="Pedir novo link" onPress={() => router.replace('/forgot-password')} />
      </Screen>
    );
  }

  return (
    <Screen title="Nova senha">
      {done ? (
        <>
          <SuccessNote message="Senha alterada. Entre com a nova senha." />
          <Button title="Ir para o login" onPress={() => router.replace('/login')} />
        </>
      ) : (
        <>
          <T v="body" style={{ marginBottom: 20 }}>
            Crie uma senha com pelo menos 8 caracteres, com letras e números.
          </T>
          {error && <ErrorNote message={error} />}
          <Field label="Nova senha" icon="lock" value={password} onChangeText={setPassword} secureTextEntry maxLength={72} />
          <Field label="Confirme a senha" icon="lock" value={confirm} onChangeText={setConfirm} secureTextEntry maxLength={72} />
          <Button title="Salvar nova senha" onPress={submit} loading={busy} disabled={!password || !confirm} />
        </>
      )}
    </Screen>
  );
}
