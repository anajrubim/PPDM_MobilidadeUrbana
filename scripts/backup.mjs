// US30 — backup e restauração do PostgreSQL de desenvolvimento (Windows, Linux e macOS).
//
//   npm run backup                 backup agora, em backups/dmr-AAAAMMDD-HHMMSS.dump (formato custom do pg_dump)
//   npm run backup:list            lista os backups
//   npm run restore -- <arquivo>   restaura um backup no banco (APAGA os dados atuais; pede --sim para confirmar)
//
// Usa o container "db" do docker-compose. Sem Docker: --no-docker usa pg_dump/pg_restore do computador
// (DATABASE_URL do backend/.env). Em produção os backups automáticos a cada 24 h ficam no serviço "backup"
// do docker-compose — ver docs/BACKUP.md.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { capture, fail, isWin, ok, ROOT, step, warn } from './lib.mjs';

const [cmd = 'backup', ...rest] = process.argv.slice(2);
const noDocker = rest.includes('--no-docker');
const DIR = path.join(ROOT, 'backups');

function databaseUrl() {
  const env = path.join(ROOT, 'backend', '.env');
  const line = fs.existsSync(env) ? fs.readFileSync(env, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL=')) : null;
  return line?.slice('DATABASE_URL='.length).trim() || 'postgres://dmr:dmr@localhost:5434/dmr';
}

/** Roda o comando passando arquivos pelo stdin/stdout (funciona com o docker compose exec -T). */
function pipe(command, args, { input, output } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ROOT, shell: isWin, stdio: [input ? 'pipe' : 'ignore', output ? 'pipe' : 'inherit', 'inherit'] });
    if (input) fs.createReadStream(input).pipe(child.stdin);
    if (output) child.stdout.pipe(fs.createWriteStream(output));
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

const tool = (name, args) => (noDocker ? [name, [...args, '-d', databaseUrl()]] : ['docker', ['compose', 'exec', '-T', 'db', name, '-U', 'dmr', '-d', 'dmr', ...args]]);

if (!noDocker && !capture('docker', ['compose', 'ps', '--status', 'running', '-q', 'db'])) {
  fail('O banco do Docker não está rodando. Suba com "npm run db:up" (ou use --no-docker com um PostgreSQL instalado).');
}

if (cmd === 'list') {
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.dump')).sort() : [];
  if (!files.length) warn('Nenhum backup em backups/. Rode: npm run backup');
  for (const f of files) console.log(`  ${f}  (${(fs.statSync(path.join(DIR, f)).size / 1024).toFixed(0)} KB)`);
  process.exit(0);
}

if (cmd === 'backup') {
  step('Backup do banco');
  fs.mkdirSync(DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const file = path.join(DIR, `dmr-${stamp}.dump`);
  const [c, a] = tool('pg_dump', ['-Fc', '--no-owner', '--no-privileges']);
  if ((await pipe(c, a, { output: file })) !== 0 || !fs.existsSync(file) || fs.statSync(file).size === 0) {
    fs.rmSync(file, { force: true });
    fail('pg_dump falhou.');
  }
  ok(`backups/${path.basename(file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
  process.exit(0);
}

if (cmd === 'restore') {
  const name = rest.find((a) => !a.startsWith('--'));
  if (!name) fail('Informe o arquivo: npm run restore -- backups/dmr-AAAAMMDD-HHMMSS.dump --sim');
  const file = path.resolve(ROOT, name);
  if (!fs.existsSync(file)) fail(`Arquivo não encontrado: ${file}`);
  if (!rest.includes('--sim')) fail(`Isso APAGA os dados atuais do banco e coloca os do backup. Para confirmar: npm run restore -- ${name} --sim`);
  step(`Restaurando ${path.basename(file)}`);
  const [c, a] = tool('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--single-transaction']);
  if ((await pipe(c, a, { input: file })) !== 0) fail('pg_restore falhou (o banco não foi alterado: a restauração é numa transação só).');
  ok('Banco restaurado.');
  process.exit(0);
}

fail(`comando desconhecido: ${cmd} (use backup, list ou restore)`);
