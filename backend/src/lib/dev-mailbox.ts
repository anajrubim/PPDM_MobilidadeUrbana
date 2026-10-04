import { Router } from 'express';
import type { SentMail } from './mailer.js';

export const isLoopback = (addr?: string) => !!addr && /^(127\.|::1$|::ffff:127\.)/.test(addr);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Transforma URLs do texto em links clicáveis (o texto já vem escapado). */
const linkify = (s: string) => s.replace(/(https?:\/\/[^\s<]+|mobilidade:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');

/**
 * Caixa de entrada de desenvolvimento: sem SMTP, os e-mails (ex.: link de redefinição de senha, US03)
 * aparecem em http://localhost:3333/dev/emails. Só é montada fora de produção.
 */
export function devMailboxRoutes(outbox: SentMail[]): Router {
  const r = Router();
  // Os e-mails trazem links de redefinição de senha: só quem está no próprio computador pode ver
  // (em desenvolvimento a API escuta na rede para o celular conseguir acessar).
  r.use(['/dev/emails', '/api/v1/dev/emails'], (req, res, next) => {
    if (isLoopback(req.socket.remoteAddress)) return next();
    res.status(403).json({ error: { code: 'forbidden', message: 'A caixa de e-mails de desenvolvimento só abre no próprio computador' } });
  });
  r.get('/api/v1/dev/emails', (_req, res) => {
    res.json({ data: outbox });
  });
  r.get('/dev/emails', (_req, res) => {
    const items = outbox
      .map(
        (m) => `<article>
  <header><strong>${esc(m.subject)}</strong><span>para ${esc(m.to)} · ${new Date(m.sentAt).toLocaleString('pt-BR')}</span></header>
  <pre>${linkify(esc(m.text))}</pre>
</article>`,
      )
      .join('\n');
    // A página tem só estilo inline (nada de script): permite o CSP restritivo do helmet
    res.type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5">
<title>Caixa de e-mails (dev)</title>
<style>
body{font-family:system-ui,sans-serif;background:#F5F7FA;color:#1C2833;margin:0;padding:20px}
h1{font-size:20px;color:#1B4F72;margin:0 0 4px}p.sub{color:#566573;margin:0 0 18px;font-size:14px}
article{background:#fff;border:1px solid #E4E9EE;border-radius:14px;padding:16px;margin-bottom:12px;max-width:760px}
header{display:flex;flex-direction:column;gap:2px;margin-bottom:10px}header span{color:#93A0AC;font-size:13px}
pre{white-space:pre-wrap;word-break:break-all;font:14px/1.5 system-ui,sans-serif;margin:0}
a{color:#1B4F72;font-weight:700}.empty{color:#566573}
</style></head><body>
<h1>📬 Caixa de e-mails de desenvolvimento</h1>
<p class="sub">SMTP não configurado: os e-mails enviados pela API aparecem aqui (atualiza a cada 5 s).</p>
${items || '<p class="empty">Nenhum e-mail enviado ainda.</p>'}
</body></html>`);
  });
  return r;
}
