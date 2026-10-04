// Utilitários dos scripts (Windows, Linux e macOS — sem bash, sem cmd).
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const isWin = process.platform === 'win32';

const color = (c) => (s) => (process.stdout.isTTY ? `\x1b[${c}m${s}\x1b[0m` : s);
export const green = color(32);
export const red = color(31);
export const yellow = color(33);
export const cyan = color(36);
export const bold = color(1);

export const step = (msg) => console.log(`\n${cyan('▶')} ${bold(msg)}`);
export const ok = (msg) => console.log(`  ${green('✔')} ${msg}`);
export const warn = (msg) => console.log(`  ${yellow('!')} ${msg}`);
export const fail = (msg) => {
  console.error(`\n${red('✘')} ${msg}`);
  process.exit(1);
};

/** Roda um comando mostrando a saída; devolve o código de saída. `npm`/`npx` funcionam no Windows via shell. */
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: isWin, cwd: opts.cwd ?? ROOT, env: { ...process.env, ...opts.env } });
  return r.status ?? 1;
}

/** Roda um comando e devolve a saída (ou null se falhar / não existir). */
export function capture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: isWin, cwd: opts.cwd ?? ROOT });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Processo de longa duração com prefixo colorido em cada linha. */
export function start(name, colorFn, cmd, args, opts = {}) {
  // Linux/macOS: grupo de processos próprio, para encerrar a árvore inteira depois (killTree)
  const child = spawn(cmd, args, { cwd: opts.cwd ?? ROOT, shell: isWin, detached: !isWin, env: { ...process.env, FORCE_COLOR: '1', ...opts.env } });
  const prefix = colorFn(`[${name}]`);
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const l of lines) out.write(`${prefix} ${l}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  return child;
}

/** Encerra o processo e os filhos dele (no Windows o kill comum não derruba a árvore). */
export function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else {
    try {
      process.kill(-child.pid, 'SIGTERM'); // o grupo inteiro (npm → tsx/expo → node)
    } catch {
      child.kill('SIGTERM');
    }
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** true se a porta está livre no computador (nenhum outro programa escutando). */
export function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port);
  });
}

/** Para com mensagem clara se API/app já estiverem rodando (ou outro programa usar as portas). */
export async function requirePorts(ports = [3333, 3443, 8081]) {
  const busy = [];
  for (const p of ports) if (!(await portFree(p))) busy.push(p);
  if (busy.length) {
    fail(
      `Porta(s) ${busy.join(', ')} em uso. Feche a outra execução do app (Ctrl+C na janela dela) ou o programa que usa a porta e tente de novo.` +
        (isWin ? `\n  Para descobrir quem usa: netstat -ano | findstr :${busy[0]}` : `\n  Para descobrir quem usa: lsof -i :${busy[0]}`),
    );
  }
}
