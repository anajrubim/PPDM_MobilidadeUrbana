// App Android nativo (Android Studio / emulador) — Windows, Linux e macOS.
//
//   npm run android:apk        compila o APK de release (JavaScript embutido, não precisa do Metro)
//   npm run android:emulador   liga o primeiro emulador criado no Android Studio (Device Manager)
//   npm run android:instalar   instala o APK no emulador/celular conectado e abre o app
//   npm run android            tudo: sobe banco + API (se não estiverem no ar), compila, liga o emulador, instala e abre
//                              (--sem-build reaproveita o APK já compilado)
//
// Para rodar pelo botão Run ▶ do Android Studio (build de debug), use npm run dev:android — ver README.
//
// Opções do APK:  --lan                API no IP do computador na rede (celular na mesma Wi-Fi)
//                 --api-url=<url>      API em outro endereço (padrão: http://10.0.2.2:3333, o PC visto do emulador)
//                 --abis=x86_64,...    arquiteturas (padrão: x86_64,arm64-v8a — emulador e celulares atuais)
//                 --subst              Windows: compila por uma unidade virtual curta (pasta com caminho muito longo)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { capture, fail, isWin, ok, ROOT, run, sleep, step, warn } from './lib.mjs';

const MOBILE = path.join(ROOT, 'mobile');
const PACKAGE = 'app.mobilidade.urbana';
const APK_OUT = path.join(ROOT, 'apk', 'mobilidade-urbana-sprint01.apk');
const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

// --log=arquivo: mostra tudo na tela e grava o mesmo texto no arquivo (usado pelo ANDROID-WINDOWS.bat)
if (opt('log') && !process.env.MU_ANDROID_CHILD) {
  const { spawn } = await import('node:child_process');
  const log = fs.createWriteStream(path.resolve(ROOT, opt('log')));
  log.write(`=== npm run android — ${new Date().toLocaleString('pt-BR')} ===\n`);
  const child = spawn(process.execPath, [process.argv[1], ...args.filter((a) => !a.startsWith('--log='))], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, MU_ANDROID_CHILD: '1' },
  });
  for (const [from, to] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    from.on('data', (d) => {
      to.write(d);
      log.write(d);
    });
  }
  child.on('exit', (code) => log.end(`\n=== fim (código ${code}) ===\n`, () => process.exit(code ?? 1)));
  await new Promise(() => {}); // o resto do script roda no processo filho
}

/** Pasta do Android SDK (a mesma que o Android Studio usa). */
function sdkDir() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    isWin && process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    process.platform === 'darwin' && path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
  ].filter(Boolean);
  return candidates.find((d) => fs.existsSync(path.join(d, 'platform-tools')));
}

const exe = (name) => (isWin ? `${name}.exe` : name);
function tools() {
  const sdk = sdkDir();
  if (!sdk) {
    fail(
      'Android SDK não encontrado. Instale o Android Studio (ele baixa o SDK) ou defina ANDROID_HOME.\n' +
        '  Windows: %LOCALAPPDATA%\\Android\\Sdk · Linux: ~/Android/Sdk',
    );
  }
  return { sdk, adb: path.join(sdk, 'platform-tools', exe('adb')), emulator: path.join(sdk, 'emulator', exe('emulator')) };
}

/** JDK 17+: JAVA_HOME, senão o que vem dentro do Android Studio. */
function javaHome() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const candidates = isWin
    ? [path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Android', 'Android Studio', 'jbr')]
    : process.platform === 'darwin'
      ? ['/Applications/Android Studio.app/Contents/jbr/Contents/Home']
      : ['/opt/android-studio/jbr', path.join(os.homedir(), 'android-studio', 'jbr'), '/snap/android-studio/current/jbr'];
  return candidates.find((d) => fs.existsSync(d));
}

const adbOut = (adb, a) => {
  const r = spawnSync(adb, a, { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
};
const devices = (adb) =>
  adbOut(adb, ['devices'])
    .split(/\r?\n/)
    .slice(1)
    .filter((l) => /\tdevice$/.test(l))
    .map((l) => l.split('\t')[0]);

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(i.address)) return i.address;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------

async function buildApk() {
  const { sdk } = tools();
  const java = javaHome();
  if (!java && !capture('java', ['-version'])) fail('JDK não encontrado. Instale o Android Studio (traz o JDK) ou defina JAVA_HOME (JDK 17+).');
  // Dependências do app: instala se faltarem ou se o package-lock mudou desde a última instalação
  const installed = path.join(MOBILE, 'node_modules', '.package-lock.json');
  if (!fs.existsSync(installed) || fs.statSync(installed).mtimeMs < fs.statSync(path.join(MOBILE, 'package-lock.json')).mtimeMs) {
    step('Instalando as dependências do app');
    if (run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: MOBILE }) !== 0) fail('npm ci do app falhou.');
  }

  let apiUrl = opt('api-url') ?? 'http://10.0.2.2:3333';
  if (args.includes('--lan')) {
    const ip = lanIp();
    if (!ip) fail('Não achei o IP do computador na rede local. Use --api-url=http://<ip>:3333');
    apiUrl = `http://${ip}:3333`;
  }
  const abis = opt('abis') ?? 'x86_64,arm64-v8a';

  step(`Compilando o APK (API em ${apiUrl}) — 5 a 20 min na primeira vez`);
  fs.writeFileSync(path.join(MOBILE, 'android', 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\')}\n`);

  // Windows: o CMake/ninja do NDK não aceita caminhos com mais de 260 caracteres. O plugin
  // with-short-native-path já resolve na maioria dos casos; se o projeto estiver numa pasta muito funda,
  // --subst compila por uma unidade virtual curta (subst não precisa de administrador).
  let root = ROOT;
  let drive = null;
  if (isWin && args.includes('--subst')) {
    for (const letter of 'MNOPQRSTUVWXYZ') {
      if (!fs.existsSync(`${letter}:\\`) && spawnSync('subst', [`${letter}:`, ROOT]).status === 0) {
        drive = `${letter}:`;
        root = `${drive}\\`;
        break;
      }
    }
    if (drive) ok(`unidade virtual ${drive} → ${ROOT}`);
    else warn('não consegui criar uma unidade virtual (subst); compilando pelo caminho normal');
  }
  const androidDir = path.join(root, 'mobile', 'android');
  const gradlew = isWin ? 'gradlew.bat' : './gradlew';
  if (!isWin) fs.chmodSync(path.join(androidDir, 'gradlew'), 0o755);

  let code;
  try {
    code = run(gradlew, ['assembleRelease', `-PreactNativeArchitectures=${abis}`, '--console=plain'], {
      cwd: androidDir,
      env: { EXPO_PUBLIC_API_URL: apiUrl, NODE_ENV: 'production', ...(java ? { JAVA_HOME: java } : {}) },
    });
  } finally {
    if (drive) spawnSync('subst', [drive, '/d']);
  }
  const built = path.join(MOBILE, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (code !== 0 || !fs.existsSync(built)) fail('A compilação do APK falhou (veja as mensagens acima).');
  fs.mkdirSync(path.dirname(APK_OUT), { recursive: true });
  fs.copyFileSync(built, APK_OUT);
  ok(`APK pronto: ${path.relative(ROOT, APK_OUT)} (${(fs.statSync(APK_OUT).size / 1e6).toFixed(1)} MB)`);
}

async function startEmulator() {
  const { adb, emulator } = tools();
  step('Emulador Android');
  if (devices(adb).length) return ok(`já conectado: ${devices(adb).join(', ')}`);
  if (!fs.existsSync(emulator)) fail('Emulador não instalado. No Android Studio: SDK Manager → SDK Tools → Android Emulator.');
  const avd = opt('avd') ?? capture(emulator, ['-list-avds'])?.split(/\r?\n/).find(Boolean);
  if (!avd) fail('Nenhum emulador criado. No Android Studio: Device Manager → Create Virtual Device (ex.: Pixel 7, Android 14).');
  ok(`ligando ${avd}…`);
  const { spawn } = await import('node:child_process');
  spawn(emulator, ['-avd', avd, '-no-snapshot-save', '-no-boot-anim'], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 150; i++) {
    if (adbOut(adb, ['shell', 'getprop', 'sys.boot_completed']) === '1') return ok('emulador pronto');
    await sleep(2000);
  }
  fail('O emulador não terminou de ligar em 5 minutos. Abra-o pelo Android Studio e rode de novo.');
}

async function installAndOpen() {
  const { adb } = tools();
  step('Instalando e abrindo o app');
  const list = devices(adb);
  if (!list.length) fail('Nenhum emulador ou celular conectado (adb devices). Rode: npm run android:emulador');
  if (!fs.existsSync(APK_OUT)) fail('APK não encontrado. Rode antes: npm run android:apk');
  spawnSync(adb, ['uninstall', PACKAGE], { stdio: 'ignore' }); // apaga dados de uma instalação anterior
  if (spawnSync(adb, ['install', '-r', APK_OUT], { stdio: 'inherit' }).status !== 0) fail('adb install falhou.');
  for (const p of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) {
    spawnSync(adb, ['shell', 'pm', 'grant', PACKAGE, `android.permission.${p}`], { stdio: 'ignore' });
  }
  // Emulador: coloca a posição no centro da rede de demonstração (São José dos Campos)
  spawnSync(adb, ['emu', 'geo', 'fix', '-45.8846', '-23.1866'], { stdio: 'ignore' });
  // Celular pelo cabo USB: deixa o "localhost:3333" do celular apontar para a API deste computador
  spawnSync(adb, ['reverse', 'tcp:3333', 'tcp:3333'], { stdio: 'ignore' });
  spawnSync(adb, ['shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1'], { stdio: 'ignore' });
  ok(`app aberto em ${list.join(', ')} — conta de demonstração: marina@email.com / Senha@123`);
}

/** 'ok' = a API da Sprint 1 responde · 'outra' = outro programa está na porta 3333 · null = nada */
const apiState = async () => {
  try {
    const res = await fetch('http://localhost:3333/api/v1/health', { signal: AbortSignal.timeout(2000) });
    const body = await res.json().catch(() => null);
    return body?.data?.app === 'mobilidade-urbana-sprint-01' ? 'ok' : 'outra';
  } catch {
    return null;
  }
};
const apiUp = async () => (await apiState()) === 'ok';

/** Garante banco + API no ar (sobe numa janela/processo separado se ainda não estiverem). */
async function ensureApi() {
  step('Banco de dados e API');
  const state = await apiState();
  if (state === 'ok') return ok('API já está rodando em http://localhost:3333');
  if (state === 'outra') {
    fail(
      'A porta 3333 está ocupada por outro programa (não é a API desta Sprint 1). Feche-o e rode de novo.' +
        (isWin ? '\n  Para descobrir quem usa: netstat -ano | findstr :3333' : '\n  Para descobrir quem usa: lsof -i :3333'),
    );
  }
  if (!fs.existsSync(path.join(ROOT, 'backend', 'node_modules')) && run('node', ['scripts/setup.mjs']) !== 0) fail('npm run setup falhou.');
  if (!args.includes('--no-docker') && run('node', ['scripts/db.mjs', 'up']) !== 0) fail('Não consegui subir o PostgreSQL (Docker aberto?).');
  if (run('npm', ['run', 'seed']) !== 0) fail('npm run seed falhou.');
  const { spawn } = await import('node:child_process');
  if (isWin) {
    // janela própria: fica aberta mostrando a API; feche-a para parar
    spawn('cmd', ['/c', 'start', '"API - Mobilidade Urbana (porta 3333)"', 'cmd', '/k', 'npm run dev:api'], { cwd: ROOT, detached: true, stdio: 'ignore', shell: false, windowsVerbatimArguments: true }).unref();
  } else {
    const out = fs.openSync(path.join(ROOT, 'api-android.log'), 'w');
    spawn('npm', ['run', 'dev:api'], { cwd: ROOT, detached: true, stdio: ['ignore', out, out] }).unref();
  }
  for (let i = 0; i < 60; i++) {
    if (await apiUp()) return ok('API no ar em http://localhost:3333' + (isWin ? ' (janela "API - Mobilidade Urbana")' : ' (saída em api-android.log)'));
    await sleep(1000);
  }
  fail('A API não respondeu em 60 s.');
}

{
  const cmd = args.find((a) => !a.startsWith('--')) ?? 'tudo';
  if (cmd === 'apk') await buildApk();
  else if (cmd === 'emulador') await startEmulator();
  else if (cmd === 'instalar') await installAndOpen();
  else if (cmd === 'api') await ensureApi();
  else if (cmd === 'tudo') {
    await ensureApi();
    if (!args.includes('--sem-build') || !fs.existsSync(APK_OUT)) await buildApk();
    await startEmulator();
    await installAndOpen();
    console.log(`\n${'='.repeat(60)}\nPRONTO: app rodando no Android. API em http://localhost:3333 (o emulador a vê como 10.0.2.2:3333).`);
  } else fail(`comando desconhecido: ${cmd} (use tudo, apk, emulador, instalar ou api)`);
}
