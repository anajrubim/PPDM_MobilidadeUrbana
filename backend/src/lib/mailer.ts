import nodemailer from 'nodemailer';
import type { Logger } from 'pino';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}
export interface SentMail extends Mail {
  id: number;
  sentAt: string;
}
export interface Mailer {
  send(mail: Mail): Promise<void>;
  /** Só no modo desenvolvimento (sem SMTP): e-mails ficam numa caixa local, visível em /dev/emails. */
  outbox?: SentMail[];
}

const OUTBOX_LIMIT = 50;

/** US03 — envio de e-mail. Com SMTP_URL usa SMTP real; sem ele guarda na caixa local e mostra no log. */
export function createMailer(smtpUrl: string, from: string, logger: Logger): Mailer {
  if (!smtpUrl) {
    const outbox: SentMail[] = [];
    let seq = 0;
    return {
      outbox,
      async send(mail) {
        outbox.unshift({ ...mail, id: ++seq, sentAt: new Date().toISOString() });
        outbox.length = Math.min(outbox.length, OUTBOX_LIMIT);
        logger.info({ to: mail.to, subject: mail.subject }, 'e-mail guardado na caixa de desenvolvimento (veja /dev/emails)');
        logger.info(`\n----- E-MAIL para ${mail.to} -----\n${mail.text}\n----------------------------------`);
      },
    };
  }
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async send(mail) {
      await transport.sendMail({ from, ...mail });
    },
  };
}
