// npm run setup — prepara tudo para rodar: dependências, .env e certificado HTTPS de desenvolvimento.
// Uso: npm run setup            (API + app)
//      npm run setup -- --e2e   (também instala o Playwright para os testes ponta a ponta e o vídeo)
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { bold, capture, fail, green, ok, ROOT, run, step, warn } from './lib.mjs';

const withE2E = process.argv.includes('--e2e');

step('Conferindo o Node.js');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 19)) fail(`Node.js ${process.versions.node} é antigo. Instale o Node 22 LTS: https://nodejs.org`);
ok(`Node.js ${process.versions.node}`);

const docker = capture('docker', ['--version']);
if (docker) ok(docker);
else warn('Docker não encontrado. Você vai precisar dele (npm run db:up) ou de um PostgreSQL instalado — veja o README.');

for (const pkg of ['backend', 'mobile', ...(withE2E ? ['e2e'] : [])]) {
  step(`Instalando dependências de ${pkg}/`);
  const lock = existsSync(path.join(ROOT, pkg, 'package-lock.json'));
  if (run('npm', [lock ? 'ci' : 'install', '--no-audit', '--no-fund'], { cwd: path.join(ROOT, pkg) }) !== 0) fail(`npm falhou em ${pkg}/`);
  ok(`${pkg}/ pronto`);
}

step('Configuração da API (backend/.env)');
const env = path.join(ROOT, 'backend', '.env');
if (existsSync(env)) ok('backend/.env já existe (mantido)');
else {
  copyFileSync(path.join(ROOT, 'backend', '.env.example'), env);
  ok('backend/.env criado a partir do .env.example');
}

step('Certificado HTTPS de desenvolvimento (US13)');
if (run('npm', ['run', 'certs'], { cwd: path.join(ROOT, 'backend') }) !== 0) warn('Não foi possível gerar o certificado: a API sobe só em HTTP.');

if (withE2E) {
  step('Navegador do Playwright (testes E2E e vídeo)');
  if (run('npx', ['playwright', 'install', 'chromium'], { cwd: path.join(ROOT, 'e2e') }) !== 0) {
    warn('Não consegui baixar o Chromium. Alternativa: use o Chrome instalado com PW_CHANNEL=chrome.');
  }
}

console.log(`\n${green('Tudo pronto!')} Próximos passos:\n`);
console.log(`  ${bold('npm run db:up')}   sobe o PostgreSQL (Docker)`);
console.log(`  ${bold('npm run seed')}    cria as tabelas, a rede de demonstração e a conta marina@email.com / Senha@123`);
console.log(`  ${bold('npm run dev')}     sobe a API e o app no navegador (http://localhost:8081)\n`);
