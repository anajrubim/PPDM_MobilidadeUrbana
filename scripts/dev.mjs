// npm run dev — sobe a API (HTTP 3333 / HTTPS 3443) e o app no navegador (8081) juntos. Ctrl+C encerra os dois.
// Para abrir no celular com o Expo Go: npm run dev -- --mobile  (mostra o QR Code em vez de abrir o navegador)
// Para o Android Studio (botão Run ▶):  npm run dev:android  (API + Metro, que entrega o JavaScript ao app de debug)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cyan, green, isWin, killTree, requirePorts, ROOT, start } from './lib.mjs';

const android = process.argv.includes('--android');
const mobile = android || process.argv.includes('--mobile');

// Android: se a API desta Sprint já estiver no ar (ex.: aberta pelo ANDROID-WINDOWS.bat), só sobe o Metro
let apiRunning = false;
if (android) {
  try {
    const res = await fetch('http://localhost:3333/api/v1/health', { signal: AbortSignal.timeout(2000) });
    apiRunning = (await res.json())?.data?.app === 'mobilidade-urbana-sprint-01';
  } catch {
    /* nada na porta 3333 */
  }
}
await requirePorts(apiRunning ? [8081] : undefined);
const api = apiRunning ? null : start('api', cyan, 'npm', ['run', 'dev'], { cwd: path.join(ROOT, 'backend') });
if (apiRunning) console.log('API desta Sprint já está rodando na porta 3333 — subindo só o Metro.');
const app = mobile
  ? start('app', green, 'npx', ['expo', 'start'], { cwd: path.join(ROOT, 'mobile') })
  : start('app', green, 'npx', ['expo', 'start', '--web'], { cwd: path.join(ROOT, 'mobile') });

if (android) {
  // Celular pelo cabo USB: o "localhost" do aparelho passa a ser este computador (no emulador não precisa)
  const sdk = [process.env.ANDROID_HOME, isWin && process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'), path.join(os.homedir(), 'Android', 'Sdk')]
    .filter(Boolean)
    .find((d) => fs.existsSync(path.join(d, 'platform-tools')));
  const adb = sdk && path.join(sdk, 'platform-tools', isWin ? 'adb.exe' : 'adb');
  for (const port of ['8081', '3333']) if (adb) spawnSync(adb, ['reverse', `tcp:${port}`, `tcp:${port}`], { stdio: 'ignore' });
  console.log('\nAndroid Studio: File → Open → pasta mobile/android, escolha o emulador e clique em Run ▶.');
  console.log('O app de debug busca o JavaScript neste Metro (porta 8081) e a API na porta 3333.');
}
console.log('\nAPI:  http://localhost:3333/api/v1  (HTTPS: https://localhost:3443/api/v1)');
console.log('App:  http://localhost:8081   ·   E-mails de teste: http://localhost:3333/dev/emails');
console.log('Conta de demonstração: marina@email.com / Senha@123   ·   Ctrl+C para parar\n');

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  killTree(api);
  killTree(app);
  setTimeout(() => process.exit(code), 500);
};
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
for (const [name, child] of [['API', api], ['app', app]]) {
  child?.on('exit', (code) => {
    if (!stopping) {
      console.error(`\n${name} encerrou (código ${code}). Parando tudo.`);
      stop(code ?? 1);
    }
  });
}
