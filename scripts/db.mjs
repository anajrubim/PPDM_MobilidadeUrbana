// npm run db:up | db:down | db:reset — PostgreSQL de desenvolvimento via Docker Compose.
// Porta 5434 no computador (não conflita com um PostgreSQL já instalado na 5432).
import { capture, fail, ok, run, sleep, step, warn } from './lib.mjs';

const action = process.argv[2] ?? 'up';
if (!capture('docker', ['--version'])) {
  fail(
    'Docker não encontrado.\n  • Instale o Docker Desktop (Windows/macOS) ou o Docker Engine (Linux), ou\n' +
      '  • use um PostgreSQL 14+ instalado: crie o usuário/senha dmr/dmr e os bancos dmr e dmr_test,\n' +
      '    e ajuste DATABASE_URL / TEST_DATABASE_URL em backend/.env (veja o README).',
  );
}
if (!capture('docker', ['info', '--format', '{{.ServerVersion}}'])) fail('O Docker está instalado mas não está rodando. Abra o Docker Desktop e tente de novo.');

const compose = (...args) => run('docker', ['compose', ...args]);

if (action === 'down') {
  step('Parando o banco');
  process.exit(compose('stop', 'db'));
}
if (action === 'reset') {
  step('Apagando o banco (dados de desenvolvimento)');
  compose('down', '-v');
}

step('Subindo o PostgreSQL (docker compose up -d db)');
if (compose('up', '-d', 'db') !== 0) fail('docker compose falhou. A porta 5434 está livre?');

process.stdout.write('  aguardando o banco ficar pronto');
for (let i = 0; i < 60; i++) {
  const status = capture('docker', ['compose', 'ps', '--format', '{{.Health}}', 'db']);
  if (status === 'healthy') {
    console.log('');
    ok('PostgreSQL pronto em localhost:5434 (usuário dmr, senha dmr, bancos dmr e dmr_test)');
    if (action === 'reset') warn('Rode "npm run seed" para recriar os dados de demonstração.');
    process.exit(0);
  }
  process.stdout.write('.');
  await sleep(1000);
}
console.log('');
fail('O banco não ficou pronto em 60 s. Veja os logs: docker compose logs db');
