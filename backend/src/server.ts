import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import pino from 'pino';
import { createApp, type Deps } from './app.js';
import { loadConfig } from './config.js';
import { runMigrations } from './db/migrator.js';
import { createPool } from './db/pool.js';
import { createMailer } from './lib/mailer.js';

const config = loadConfig();
const logger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  // Log legível no terminal em desenvolvimento (Windows e Linux)
  transport:
    config.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, ignore: 'pid,hostname,req,res,responseTime,userId', translateTime: 'HH:MM:ss' },
        },
});
const db = createPool(config.DATABASE_URL);
try {
  await runMigrations(db);
} catch (err) {
  logger.fatal(
    { err: (err as Error).message },
    `Não consegui acessar o PostgreSQL em ${config.DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}. ` + 'O banco está rodando? (npm run db:up)',
  );
  process.exit(1);
}

const deps: Deps = {
  db,
  config,
  logger,
  mailer: createMailer(config.SMTP_URL, config.MAIL_FROM, logger),
  clock: () => new Date(),
};
const app = createApp(deps);
const servers: (http.Server | https.Server)[] = [];

// US13 — HTTPS direto no Node quando há certificado (npm run certs gera um autoassinado para desenvolvimento)
const hasCert = existsSync(config.TLS_CERT_FILE) && existsSync(config.TLS_KEY_FILE);
if (hasCert) {
  const tls = https.createServer({ cert: readFileSync(config.TLS_CERT_FILE), key: readFileSync(config.TLS_KEY_FILE) }, app);
  tls.listen(config.HTTPS_PORT, () => logger.info(`API (HTTPS) em https://localhost:${config.HTTPS_PORT}/api/v1`));
  servers.push(tls);
} else if (config.FORCE_HTTPS) {
  logger.warn('FORCE_HTTPS=true sem certificado: o TLS precisa ser terminado por um proxy na frente da API.');
} else {
  logger.warn('Sem certificado TLS: só HTTP. Rode "npm run certs" para habilitar o HTTPS local.');
}

// HTTP: usado pelo app em desenvolvimento (emulador/Expo Go). Com FORCE_HTTPS=true apenas redireciona.
const plain = http.createServer(app);
plain.listen(config.PORT, () =>
  logger.info(`API (HTTP${config.FORCE_HTTPS ? ' → redireciona para HTTPS' : ''}) em http://localhost:${config.PORT}/api/v1`),
);
servers.push(plain);
if (config.NODE_ENV !== 'production' && deps.mailer.outbox) {
  logger.info(`Caixa de e-mails de desenvolvimento: http://localhost:${config.PORT}/dev/emails`);
}

const shutdown = () => {
  logger.info('encerrando...');
  let open = servers.length;
  for (const s of servers) {
    s.close(() => {
      if (--open === 0) void db.end().finally(() => process.exit(0));
    });
  }
  setTimeout(() => process.exit(1), 5_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'promessa rejeitada sem tratamento'));
