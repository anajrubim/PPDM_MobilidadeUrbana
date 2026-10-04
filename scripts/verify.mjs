// npm run verify — verificação completa da Sprint 1 nesta máquina (Windows ou Linux), do zero:
//   dependências (com Playwright) → banco (Docker) → seed → lint + tipos + testes → API + app → testes E2E
//   → (opcional, --video) grava o tour em vídeo.
// Tudo vai para verificacao.log na raiz. Código de saída 0 = tudo certo.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import https from 'node:https';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { isWin, killTree, portFree, ROOT, sleep } from './lib.mjs';

const withVideo = process.argv.includes('--video');
const noDocker = process.argv.includes('--no-docker');
const logFile = path.join(ROOT, 'verificacao.log');
const log = createWriteStream(logFile);
const out = (s) => {
  process.stdout.write(s);
  log.write(s.replace(/\x1b\[[0-9;]*m/g, ''));
};
const results = [];

function runStep(name, cmd, args, opts = {}) {
  out(`\n===== ${name} =====\n$ ${cmd} ${args.join(' ')}\n`);
  const t = Date.now();
  const r = spawnSync(cmd, args, { cwd: opts.cwd ?? ROOT, shell: isWin, encoding: 'utf8', env: { ...process.env, CI: '1', ...opts.env }, maxBuffer: 64 * 1024 * 1024 });
  out((r.stdout ?? '') + (r.stderr ?? ''));
  const ok = r.status === 0;
  results.push({ name, ok, secs: Math.round((Date.now() - t) / 1000) });
  out(`----- ${ok ? 'OK' : `FALHOU (código ${r.status})`} -----\n`);
  return ok;
}

function background(name, cmd, args, cwd) {
  const child = spawn(cmd, args, { cwd, shell: isWin, detached: !isWin, env: { ...process.env, BROWSER: 'none' } });
  const write = (d) => {
    if (!log.writableEnded) log.write(`[${name}] ${d}`);
  };
  child.stdout.on('data', write);
  child.stderr.on('data', write);
  return child;
}

async function waitFor(url, secs) {
  for (let i = 0; i < secs; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* ainda subindo */
    }
    await sleep(1000);
  }
  return false;
}

out(`Verificação da Sprint 1 — ${new Date().toLocaleString('pt-BR')} — ${process.platform} ${process.arch} — Node ${process.versions.node}\n`);
let ok = runStep('Preparação (npm run setup -- --e2e)', 'node', ['scripts/setup.mjs', '--e2e']);
if (ok && !noDocker) ok = runStep('Banco PostgreSQL (npm run db:up)', 'node', ['scripts/db.mjs', 'up']);
if (ok) ok = runStep('Dados de demonstração (npm run seed)', 'npm', ['run', 'seed']);
if (ok) runStep('Lint, tipos e testes (npm run check)', 'npm', ['run', 'check']);
if (ok) runStep('Build da API e exportação do app web (npm run build)', 'npm', ['run', 'build']);

let api;
let app;
if (ok) {
  // Outra execução do app (ou outro programa) nas portas faria os testes rodarem contra o servidor errado
  const busy = [];
  for (const p of [3333, 3443, 8081]) if (!(await portFree(p))) busy.push(p);
  if (busy.length) {
    out(`\nPorta(s) ${busy.join(', ')} em uso: feche a outra execução do app antes de verificar.\n`);
    results.push({ name: `Portas livres (${busy.join(', ')} ocupadas)`, ok: false, secs: 0 });
    ok = false;
  }
}
if (ok) {
  out('\n===== Subindo API e app web =====\n');
  api = background('api', 'npm', ['run', 'dev'], path.join(ROOT, 'backend'));
  app = background('app', 'npx', ['expo', 'start', '--web', '--port', '8081'], path.join(ROOT, 'mobile'));
  const apiUp = await waitFor('http://localhost:3333/api/v1/health', 90);
  const appUp = apiUp && (await waitFor('http://localhost:8081', 180));
  // Primeira carga compila o bundle web: pede a página uma vez antes dos testes
  if (appUp) await fetch('http://localhost:8081').catch(() => undefined);
  results.push({ name: 'API e app no ar', ok: apiUp && appUp, secs: 0 });
  out(`API: ${apiUp ? 'OK' : 'NÃO SUBIU'} · app: ${appUp ? 'OK' : 'NÃO SUBIU'}\n`);
  if (apiUp && appUp) {
    runStep('Testes ponta a ponta (npm run test:e2e)', 'npm', ['run', 'test:e2e']);
    if (withVideo) runStep('Vídeo do app (npm run video)', 'npm', ['run', 'video']);
  }
}
killTree(api);
killTree(app);
await sleep(1500);

// US13/US14 — imagem de produção da API: build, sobe com HTTPS obrigatório, confere e remove
if (ok && !noDocker && !process.argv.includes('--no-image')) {
  const env = { JWT_SECRET: randomBytes(24).toString('hex'), HTTP_PORT: '18080', HTTPS_PUBLIC_PORT: '18443' };
  const built = runStep('Imagem Docker da API (docker compose build)', 'docker', ['compose', '--profile', 'prod', 'build', 'api'], { env });
  if (built && runStep('Sobe a API de produção', 'docker', ['compose', '--profile', 'prod', 'up', '-d', 'api'], { env })) {
    const health = await waitFor('http://localhost:18080/api/v1/health', 60);
    const redirect = await fetch('http://localhost:18080/api/v1/lines', { redirect: 'manual' }).then((r) => r.status).catch(() => 0);
    const tls = await new Promise((resolve) => {
      https
        .get('https://localhost:18443/api/v1/lines', { rejectUnauthorized: false }, (r) => {
          r.resume();
          resolve(r.statusCode);
        })
        .on('error', () => resolve(0));
    });
    const okImage = health && redirect === 308 && tls === 200;
    out(`\nContainer: health ${health ? 'OK' : 'FALHOU'} · HTTP→HTTPS ${redirect} · HTTPS ${tls}\n`);
    results.push({ name: 'API em produção no Docker (HTTPS obrigatório)', ok: okImage, secs: 0 });
  }
  runStep('Remove o container de teste', 'docker', ['compose', '--profile', 'prod', 'rm', '-sf', 'api'], { env });
}

out('\n===== RESUMO =====\n');
for (const r of results) out(`${r.ok ? '✔' : '✘'} ${r.name}${r.secs ? ` (${r.secs}s)` : ''}\n`);
const allOk = results.length > 0 && results.every((r) => r.ok);
out(`\n${allOk ? 'TUDO CERTO' : 'HÁ FALHAS — veja acima'} · log completo em ${logFile}\n`);
log.end();
process.exitCode = allOk ? 0 : 1;
