// npm start — tudo de uma vez: instala o que faltar, sobe o banco, cria os dados de demonstração e abre o app.
// Opções: --no-docker (usa um PostgreSQL já instalado) · --mobile (QR Code do Expo Go em vez do navegador)
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fail, ROOT, run, step } from './lib.mjs';

const has = (p) => existsSync(path.join(ROOT, p));
if (!has('backend/node_modules') || !has('mobile/node_modules') || !has('backend/.env')) {
  if (run('node', ['scripts/setup.mjs']) !== 0) fail('Falha na preparação (npm run setup).');
}
if (!process.argv.includes('--no-docker')) {
  if (run('node', ['scripts/db.mjs', 'up']) !== 0) fail('Banco indisponível. Sem Docker? Use um PostgreSQL local e rode: npm start -- --no-docker');
}
step('Dados de demonstração');
if (run('npm', ['run', 'seed'], { cwd: path.join(ROOT, 'backend') }) !== 0) fail('O seed falhou: o banco está acessível? (backend/.env → DATABASE_URL)');
step('Subindo API e app (Ctrl+C para parar)');
process.exit(run('node', ['scripts/dev.mjs', ...process.argv.slice(2).filter((a) => a === '--mobile')]));
