import { router } from 'expo-router';
import { useState } from 'react';
import { Button, ErrorNote, Field, Screen, SuccessNote, T } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useSingleFlight } from '../lib/single-flight';

/** US03 — pedido do link de redefinição por e-mail. */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const once = useSingleFlight();
  const submit = () =>
    once(async () => {
      setBusy(true);
      setError(null);
      try {
        await api.post('/auth/forgot-password', { email: email.trim() });
        setSent(true);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    });

  return (
    <Screen title="Recuperar senha">
      <T v="body" style={{ marginBottom: 20 }}>
        Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.
      </T>
      {error && <ErrorNote message={error} />}
      {sent && <SuccessNote message="Se o e-mail estiver cadastrado, você receberá o link em instantes. Ele vale por 1 hora." />}
      <Field
        label="E-mail"
        icon="mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        maxLength={254}
        autoCapitalize="none"
      />
      <Button title="Enviar link de recuperação" onPress={submit} loading={busy} disabled={!email} />
      <Button title="Voltar para o login" variant="ghost" onPress={() => router.replace('/login')} style={{ marginTop: 8 }} />
    </Screen>
  );
}
