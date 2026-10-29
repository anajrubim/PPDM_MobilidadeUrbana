import express, { Router } from 'express';
import { z } from 'zod';
import type { Deps } from '../app.js';
import type { Services } from '../modules/realtime/services.js';
import { insertServiceAlert } from '../modules/realtime/service-alerts.js';
import type { NetworkCache } from '../modules/transit/network.js';
import { isLocalDevRequest } from './dev-mailbox.js';
import { notFound } from './errors.js';
import { parse } from './http.js';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const alertSchema = z.object({
  lineCode: z.string().trim().min(1).max(10),
  kind: z.enum(['delay', 'detour', 'suspension']).default('delay'),
  title: z.string().trim().min(1).max(120).optional(),
  message: z.string().trim().min(1).max(600).optional(),
  extraDelayMin: z.coerce.number().int().min(0).max(120).optional(),
  startsInMin: z.coerce.number().int().min(0).max(7 * 1440).default(0),
  durationMin: z.coerce.number().int().min(1).max(7 * 1440).default(60),
});

const DEFAULTS = {
  delay: { title: 'Trânsito intenso', message: 'Ônibus da linha com atraso por trânsito intenso no trajeto.', extra: 8 },
  detour: { title: 'Desvio no itinerário', message: 'Obra na via: a linha faz um desvio e alguns pontos podem não ser atendidos.', extra: 3 },
  suspension: { title: 'Linha suspensa', message: 'A linha não circula neste período.', extra: 0 },
} as const;

/**
 * US17 — simular avisos de serviço (atraso, desvio, suspensão) e forçar a verificação do monitor,
 * para demonstrar as notificações sem esperar um atraso "de verdade". Só em desenvolvimento, só no próprio PC.
 */
export function devToolsRoutes(deps: Deps, cache: NetworkCache, services: Services): Router {
  const r = Router();
  r.use(['/dev/simular', '/api/v1/dev'], (req, res, next) => {
    return next()
    if (isLocalDevRequest(req)) return next();
    res.status(403).json({ error: { code: 'forbidden', message: 'As ferramentas de desenvolvimento só abrem no próprio computador' } });
  });

  const create = async (raw: unknown) => {
    const b = parse(alertSchema, raw);
    const line = (await cache.get()).lines.find((l) => l.code.toLowerCase() === b.lineCode.toLowerCase());
    if (!line) throw notFound('Linha');
    const now = deps.clock();
    const startsAt = new Date(now.getTime() + b.startsInMin * 60_000);
    const d = DEFAULTS[b.kind];
    const alert = await insertServiceAlert(deps.db, {
      lineId: line.id,
      kind: b.kind,
      title: b.title ?? d.title,
      message: b.message ?? d.message,
      extraDelayMin: b.extraDelayMin ?? d.extra,
      startsAt,
      endsAt: new Date(startsAt.getTime() + b.durationMin * 60_000),
    });
    services.alerts.invalidate();
    const tick = await services.monitor.tick();
    return { alert, line, tick };
  };

  r.post('/api/v1/dev/alerts', async (req, res) => {
    const { alert, tick } = await create(req.body);
    res.status(201).json({ data: { alert, notificationsCreated: tick } });
  });

  r.post('/api/v1/dev/monitor/tick', async (_req, res) => {
    res.json({ data: await services.monitor.tick() });
  });

  // Página simples com formulário (sem script: compatível com o CSP do helmet)
  const page = async (msg = '') => {
    const lines = (await cache.get()).lines.filter((l) => l.status === 'active');
    const opts = lines.map((l) => `<option value="${esc(l.code)}">${esc(l.code)} · ${esc(l.name)}</option>`).join('');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Simular avisos (dev)</title><style>
body{font-family:system-ui,sans-serif;background:#F5F7FA;color:#1C2833;padding:20px;max-width:640px}h1{font-size:20px;color:#1B4F72}
form{background:#fff;border:1px solid #E4E9EE;border-radius:14px;padding:16px;display:grid;gap:10px}label{font-weight:700;font-size:13px;display:grid;gap:4px}
select,input,button{font:inherit;padding:8px;border-radius:9px;border:1px solid #E4E9EE}button{background:#1B4F72;color:#fff;font-weight:700;border:0;cursor:pointer}
.ok{background:#E5F5EC;color:#186B3C;padding:10px;border-radius:10px}p{color:#566573;font-size:14px}
</style></head><body><h1> Simular atraso / mudança de itinerário</h1>
<p>Cria um aviso de serviço numa linha. Quem tem a linha nos favoritos recebe a notificação (US17) e as previsões passam a somar o atraso.</p>
${msg ? `<p class="ok">${esc(msg)}</p>` : ''}
<form method="post" action="/dev/simular">
<label>Linha<select name="lineCode">${opts}</select></label>
<label>Tipo<select name="kind"><option value="delay">Atraso</option><option value="detour">Desvio de itinerário</option><option value="suspension">Suspensão</option></select></label>
<label>Atraso extra (min)<input name="extraDelayMin" type="number" min="0" max="120" value="8"></label>
<label>Começa em (min)<input name="startsInMin" type="number" min="0" value="0"></label>
<label>Duração (min)<input name="durationMin" type="number" min="1" value="60"></label>
<button type="submit">Criar aviso e notificar</button></form></body></html>`;
  };

  r.get('/dev/simular', async (_req, res) => {
    res.type('html').send(await page());
  });
  r.post('/dev/simular', express.urlencoded({ extended: false, limit: '10kb' }), async (req, res) => {
    const { line, tick } = await create(req.body);
    res.type('html').send(await page(`Aviso criado na linha ${line.code}. Notificações enviadas: ${tick.serviceAlerts}.`));
  });
  return r;
}
