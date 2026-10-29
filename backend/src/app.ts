import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { Config } from './config.js';
import type { Db } from './db/pool.js';
import { authMiddleware } from './lib/auth.js';
import { devMailboxRoutes } from './lib/dev-mailbox.js';
import { notFound } from './lib/errors.js';
import { errorHandler } from './lib/http.js';
import { devToolsRoutes } from './lib/dev-tools.js';
import type { Mailer } from './lib/mailer.js';
import { authRoutes } from './modules/auth/routes.js';
import { ratingRoutes } from './modules/community/ratings.js';
import { reportRoutes } from './modules/community/reports.js';
import { meRoutes } from './modules/me/routes.js';
import type { PushSender } from './modules/notifications/push.js';
import { notificationRoutes } from './modules/notifications/routes.js';
import { plannerRoutes } from './modules/planner/routes.js';
import { Monitor } from './modules/realtime/monitor.js';
import { proximityRoutes } from './modules/realtime/proximity-routes.js';
import { ServiceAlerts } from './modules/realtime/service-alerts.js';
import type { Services } from './modules/realtime/services.js';
import { shareRoutes } from './modules/share/routes.js';
import { NetworkCache } from './modules/transit/network.js';
import { transitRoutes } from './modules/transit/routes.js';

/** Tokens em URL (link de compartilhamento, US29; link de redefinição, US03) nunca vão para o log. */
export const redactUrl = (url: string) =>
  url.replace(/(\/(?:s|shares)\/)[A-Za-z0-9_-]{32}(?=$|[/?#])/g, '$1[redigido]').replace(/([?&]token=)[^&#]+/gi, '$1[redigido]');

export interface Deps {
  db: Db;
  config: Config;
  logger: Logger;
  mailer: Mailer;
  /** US17 — push para os aparelhos (noPush quando não há provedor configurado). */
  push: PushSender;
  clock: () => Date;
}

export type App = Express & { services: Services; cache: NetworkCache };

export function createApp(deps: Deps): App {
  const { db, config, logger } = deps;
  const app = express();
  app.disable('x-powered-by');
  // Só confia em X-Forwarded-* quando há proxy de verdade na frente (TRUST_PROXY = nº de proxies)
  app.set('trust proxy', config.TRUST_PROXY);

  // US13 — com FORCE_HTTPS, qualquer acesso HTTP é redirecionado para HTTPS
  if (config.FORCE_HTTPS) {
    app.use((req, res, next) => {
      // A sonda de saúde (Docker/balanceador) pode vir por HTTP interno
      if (req.secure || req.path === '/api/v1/health') return next();
      const publicPort = config.HTTPS_PUBLIC_PORT ?? config.HTTPS_PORT;
      const port = publicPort === 443 ? '' : `:${publicPort}`;
      res.redirect(308, `https://${req.hostname}${port}${req.originalUrl}`);
    });
  }
  // Cabeçalhos de segurança, incluindo HSTS (o navegador passa a usar só HTTPS)
  app.use(helmet({ hsts: { maxAge: 31_536_000, includeSubDomains: true }, crossOriginResourcePolicy: false }));
  app.use(cors({ origin: config.CORS_ORIGINS === '*' ? '*' : config.CORS_ORIGINS.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: '100kb' }));
  if (config.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger,
        // Log enxuto: método, caminho e status (sem cabeçalhos, que podem conter o token)
        serializers: {
          req: (req: { method: string; url: string }) => ({ method: req.method, url: redactUrl(req.url) }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
        customProps: (req) => ({ userId: (req as express.Request).user?.id }),
        customSuccessMessage: (req, res) => `${req.method} ${redactUrl((req as express.Request).originalUrl)} → ${res.statusCode}`,
        customErrorMessage: (req, res) => `${req.method} ${redactUrl((req as express.Request).originalUrl)} → ${res.statusCode}`,
      }),
    );
  }

  const cache = new NetworkCache(db);
  const alerts = new ServiceAlerts(db);
  const services: Services = { alerts, monitor: new Monitor(db, cache, alerts, deps.push, deps.clock, logger) };
  const api = express.Router();
  const requireAuth = authMiddleware(db, config.JWT_SECRET);
  const optionalAuth = authMiddleware(db, config.JWT_SECRET, { optional: true });
  const share = shareRoutes(deps, cache, services);

  api.get('/health', async (req, res) => {
    await db.query('SELECT 1');
    res.json({ data: { status: 'ok', app: 'mobilidade-urbana-sprint-02', time: deps.clock().toISOString(), version: process.env.APP_VERSION ?? 'dev', https: req.secure } });
  });
  api.use('/auth', authRoutes(deps));
  // Sessão conferida uma vez por requisição: as rotas públicas só usam o usuário para marcar "meus" itens
  api.use(optionalAuth);
  const me = express.Router();
  me.use(meRoutes(deps, cache, services), notificationRoutes(deps), proximityRoutes(deps, cache, services), share.me);
  // Escritas de quem está logado: limite por usuário (antiabuso; as rotas sensíveis têm limites próprios)
  api.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (req) => config.NODE_ENV === 'test' || req.method === 'GET' || !req.user,
      keyGenerator: (req) => `w:${req.user!.id}`,
      handler: (_req, res) => res.status(429).json({ error: { code: 'rate_limited', message: 'Muitas ações seguidas. Tente de novo em instantes.' } }),
    }),
  );
  api.use('/me', requireAuth, me);
  api.use(transitRoutes(deps, cache, services));
  api.use(plannerRoutes(deps, cache, services));
  api.use(ratingRoutes(deps, cache, requireAuth));
  api.use(reportRoutes(deps, cache, requireAuth));
  // /s/:token e /api/v1/shares/:token são públicos: quem recebe o link não tem conta (US29)
  app.use(share.pub);
  app.use('/api/v1', api);

  // Ferramentas de desenvolvimento: caixa de e-mails (US03 sem SMTP) e simulação de avisos/atrasos (US17).
  // Nunca existem em produção e só respondem ao próprio computador.
  if (config.NODE_ENV !== 'production') {
    if (deps.mailer.outbox) app.use(devMailboxRoutes(deps.mailer.outbox));
    app.use(devToolsRoutes(deps, cache, services));
  }

  app.use((_req, _res, next) => next(notFound('Rota')));
  app.use(errorHandler(logger));
  return Object.assign(app, { services, cache });
}
