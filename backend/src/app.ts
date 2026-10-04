import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { Config } from './config.js';
import type { Db } from './db/pool.js';
import { authMiddleware } from './lib/auth.js';
import { devMailboxRoutes } from './lib/dev-mailbox.js';
import { notFound } from './lib/errors.js';
import { errorHandler } from './lib/http.js';
import type { Mailer } from './lib/mailer.js';
import { authRoutes } from './modules/auth/routes.js';
import { meRoutes } from './modules/me/routes.js';
import { NetworkCache } from './modules/transit/network.js';
import { transitRoutes } from './modules/transit/routes.js';

export interface Deps {
  db: Db;
  config: Config;
  logger: Logger;
  mailer: Mailer;
  clock: () => Date;
}

export function createApp(deps: Deps): Express {
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
          req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
        customProps: (req) => ({ userId: (req as express.Request).user?.id }),
        customSuccessMessage: (req, res) => `${req.method} ${(req as express.Request).originalUrl} → ${res.statusCode}`,
        customErrorMessage: (req, res) => `${req.method} ${(req as express.Request).originalUrl} → ${res.statusCode}`,
      }),
    );
  }

  const cache = new NetworkCache(db);
  const api = express.Router();
  const requireAuth = authMiddleware(db, config.JWT_SECRET);
  const optionalAuth = authMiddleware(db, config.JWT_SECRET, { optional: true });

  api.get('/health', async (req, res) => {
    await db.query('SELECT 1');
    res.json({ data: { status: 'ok', app: 'mobilidade-urbana-sprint-01', time: deps.clock().toISOString(), version: process.env.APP_VERSION ?? 'dev', https: req.secure } });
  });
  api.use('/auth', authRoutes(deps));
  api.use('/me', requireAuth, meRoutes(deps, cache));
  api.use(optionalAuth, transitRoutes(deps, cache));
  app.use('/api/v1', api);

  // Caixa de e-mails de desenvolvimento (US03 sem SMTP configurado). Nunca existe em produção.
  if (config.NODE_ENV !== 'production' && deps.mailer.outbox) app.use(devMailboxRoutes(deps.mailer.outbox));

  app.use((_req, _res, next) => next(notFound('Rota')));
  app.use(errorHandler(logger));
  return app;
}
