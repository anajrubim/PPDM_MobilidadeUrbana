import type { Logger } from 'pino';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Envia push para os aparelhos. A notificação já está salva no banco antes disso (histórico, US20). */
export interface PushSender {
  readonly enabled: boolean;
  send(tokens: string[], msg: PushMessage): Promise<void>;
}

/** Sem provedor: o app busca as notificações na API e mostra no aparelho (ver README, "Notificações"). */
export const noPush: PushSender = { enabled: false, send: async () => undefined };

/**
 * US17 — Expo Push Service (https://docs.expo.dev/push-notifications/sending-notifications/).
 * Para o Android entregar, o projeto Expo precisa das credenciais do FCM (google-services.json).
 */
export function expoPush(logger: Logger, accessToken?: string, fetchImpl: typeof fetch = fetch): PushSender {
  return {
    enabled: true,
    async send(tokens, msg) {
      const valid = tokens.filter((t) => /^(Exponent|Expo)PushToken\[.+\]$/.test(t));
      for (let i = 0; i < valid.length; i += 100) {
        const batch = valid.slice(i, i + 100).map((to) => ({ to, sound: 'default', ...msg }));
        try {
          const res = await fetchImpl('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify(batch),
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) logger.warn({ status: res.status }, 'push: Expo recusou o envio');
        } catch (err) {
          // Push é melhor esforço: a notificação continua no histórico e o app a mostra ao abrir
          logger.warn({ err: (err as Error).message }, 'push: falha ao enviar');
        }
      }
    },
  };
}
