import 'dotenv/config';
import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null || v === '' ? def : v === 'true'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Porta HTTP (desenvolvimento/emulador). Com FORCE_HTTPS=true ela só redireciona para o HTTPS. */
  PORT: z.coerce.number().int().positive().default(3333),
  /** US13 — porta HTTPS do próprio Node (certificado em TLS_CERT_FILE/TLS_KEY_FILE). */
  HTTPS_PORT: z.coerce.number().int().positive().default(3443),
  /** Porta HTTPS vista de fora (ex.: 443 no Docker mapeando para 3443). Padrão: HTTPS_PORT. */
  HTTPS_PUBLIC_PORT: z.coerce.number().int().positive().optional(),
  DATABASE_URL: z.string().min(1).default('postgres://dmr:dmr@localhost:5434/dmr'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter 32+ caracteres'),
  /** Endereço aberto pelo link do e-mail de redefinição (US03). */
  PUBLIC_APP_URL: z.string().default('http://localhost:8081/reset-password'),
  /** SMTP real (ex.: smtp://usuario:senha@smtp.gmail.com:587). Vazio = caixa de e-mails de desenvolvimento. */
  SMTP_URL: z.string().optional().default(''),
  MAIL_FROM: z.string().default('Mobilidade Urbana <nao-responda@mobilidade.app>'),
  TLS_CERT_FILE: z.string().optional().default('./certs/dev-cert.pem'),
  TLS_KEY_FILE: z.string().optional().default('./certs/dev-key.pem'),
  FORCE_HTTPS: bool(false),
  CORS_ORIGINS: z.string().default('*'),
  /**
   * Quantos proxies confiáveis existem na frente da API (0 = acesso direto).
   * Só com proxy de verdade o X-Forwarded-For/Proto pode ser aceito; senão qualquer cliente forja o IP
   * (burlando o limite de tentativas) ou finge ter vindo por HTTPS.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProd = env.NODE_ENV === 'production';
  const withDefaults = {
    ...env,
    // Em produção o segredo é obrigatório; em desenvolvimento há um padrão para facilitar
    JWT_SECRET: env.JWT_SECRET ?? (isProd ? undefined : 'dev-only-secret-change-me-0123456789abcdef'),
    FORCE_HTTPS: env.FORCE_HTTPS ?? (isProd ? 'true' : undefined),
  };
  const parsed = schema.safeParse(withDefaults);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${msg}`);
  }
  return parsed.data;
}
