import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * Alert.alert com botões funciona no Android/iOS, mas no react-native-web é um no-op
 * (a pré-visualização web ignorava "Sair da conta", "Concluir" etc.).
 * No navegador, usa window.confirm: OK aciona o último botão que não é "cancel";
 * Cancelar aciona o botão "cancel" ou, sem ele, o primeiro botão.
 */
export function ask(title: string, message: string, buttons: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const cancel = buttons.find((b) => b.style === 'cancel');
  const actions = buttons.filter((b) => b !== cancel);
  const confirmBtn = actions.at(-1);
  if (!confirmBtn) return;
  const dismissBtn = cancel ?? (actions.length > 1 ? actions[0] : undefined);
  if (!dismissBtn) {
    window.alert(`${title}\n\n${message}`);
    confirmBtn.onPress?.();
    return;
  }
  const hint = `\n\nOK = ${confirmBtn.text} · Cancelar = ${dismissBtn.text}`;
  if (window.confirm(`${title}\n\n${message}${hint}`)) confirmBtn.onPress?.();
  else dismissBtn.onPress?.();
}

/** Aviso simples (um botão), também visível na web. */
export function notify(title: string, message: string): void {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}
