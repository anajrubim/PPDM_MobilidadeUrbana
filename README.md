# Mobilidade Urbana — Sprint 1

Versão inicial do aplicativo de transporte público, com **tudo o que foi planejado para a Sprint 1** (US01 a US14,
48 pontos): cadastro e login, recuperação de senha por e-mail, edição de perfil, lista e busca de linhas, trajeto no
mapa, pontos de parada com horários previstos, localização atual, favoritos e dashboard — sobre uma API Node.js com
HTTPS e senhas em hash, versionada em Git e com pipeline de build/deploy.

| Pasta | O que é | Tecnologia |
|---|---|---|
| `backend/` | API REST | Node.js 22, TypeScript, Express 5, PostgreSQL 16 |
| `mobile/` | App: **Android nativo** (`mobile/android/`, abre no Android Studio), Expo Go e navegador | React Native 0.86, Expo SDK 57, Expo Router, Leaflet + OpenStreetMap |
| `e2e/` | Testes ponta a ponta e gravação do vídeo | Playwright |
| `docs/` | [**Guia do projeto**](docs/GUIA-DO-PROJETO.md) (front, back, arquitetura, decisões), [roteiro de apresentação](docs/ROTEIRO-APRESENTACAO.md), [entrega da sprint](docs/SPRINT-01.md), [API](docs/API.md), [arquitetura](docs/ARQUITETURA.md), [prints](docs/prints/) | — |
| `video/` | `tour-sprint-01.mp4`: o app rodando, passando por todas as user stories (gravado no Windows) | MP4 (fora do Git) |
| `.github/workflows/` | Pipeline CI/CD (US14) | GitHub Actions |

---

## 1. O que instalar (uma vez)

| Programa | Windows | Linux |
|---|---|---|
| **Node.js 22 LTS** | instalador em [nodejs.org](https://nodejs.org) | `nvm install 22` ou o pacote da distribuição ([nodejs.org/download](https://nodejs.org/en/download)) |
| **Docker** (para o PostgreSQL) | [Docker Desktop](https://www.docker.com/products/docker-desktop/) — deixe-o aberto | Docker Engine + plugin compose (`sudo apt install docker.io docker-compose-v2`) e seu usuário no grupo `docker` |
| Git (opcional) | [git-scm.com](https://git-scm.com) | `sudo apt install git` |

Confira no terminal (PowerShell no Windows): `node -v` (v22 ou mais novo) e `docker compose version`.

> Sem Docker? Dá para usar um PostgreSQL 14+ instalado no computador — veja a [seção 6](#6-sem-docker-postgresql-instalado).

---

## 2. Rodar — o jeito rápido

**Windows:** dê dois cliques em **`INICIAR-WINDOWS.bat`**.
**Linux:** no terminal, dentro desta pasta: `./iniciar-linux.sh`

Os dois fazem a mesma coisa que `npm start`: instalam as dependências (só na primeira vez), sobem o PostgreSQL no
Docker, criam os dados de demonstração e abrem a API e o app. Quando aparecer `Waiting on http://localhost:8081`,
abra **http://localhost:8081** no navegador.

**Conta de demonstração:** `marina@email.com` / `Senha@123` (já tem favoritas e viagens). Ou crie a sua.

Para parar: **Ctrl+C** no terminal. O banco continua no Docker (pare com `npm run db:down`).

---

## 3. Rodar — passo a passo (Windows e Linux, mesmos comandos)

Abra o **PowerShell** (Windows) ou o **terminal** (Linux) nesta pasta:

```bash
npm run setup     # instala backend/ e mobile/, cria backend/.env e o certificado HTTPS local
npm run db:up     # sobe o PostgreSQL no Docker (porta 5434) e espera ficar pronto
npm run seed      # cria as tabelas, 10 linhas, 69 paradas e a conta de demonstração
npm run dev       # sobe a API e o app no navegador
```

| Endereço | O que é |
|---|---|
| http://localhost:8081 | **o app** (versão web) |
| http://localhost:3333/api/v1/health | API (HTTP) |
| https://localhost:3443/api/v1/health | API em **HTTPS** (certificado local: o navegador avisa que não é confiável — normal em desenvolvimento) |
| http://localhost:3333/dev/emails | **caixa de e-mails de teste** — o link de "Esqueci minha senha" chega aqui (só abre no próprio computador) |

Também dá para subir cada parte num terminal separado: `npm run dev:api` e `npm run web`.

### No celular (Expo Go)

1. Instale o **Expo Go** (Play Store / App Store) — a versão compatível com o Expo SDK 57.
2. Celular e computador na **mesma rede Wi-Fi**.
3. Rode `npm run dev -- --mobile` e escaneie o QR Code que aparece no terminal (no iPhone, pela câmera).

O app descobre sozinho o endereço da API (o IP do computador, porta 3333). Se não conectar:
- **Windows:** permita o Node.js no Firewall do Windows (rede privada) ou libere as portas 3333 e 8081.
- **Linux:** `sudo ufw allow 3333/tcp && sudo ufw allow 8081/tcp` (se usar ufw).
- Ou informe o endereço manualmente. PowerShell: `$env:EXPO_PUBLIC_API_URL="http://192.168.0.10:3333"; npm run dev:app`
  · Linux: `EXPO_PUBLIC_API_URL=http://192.168.0.10:3333 npm run dev:app`

### No Android Studio (emulador ou celular)

Precisa do **Android Studio** com um emulador criado no *Device Manager* (ex.: Pixel 7, Android 14).
Detalhes, opções e problemas comuns: [docs/ANDROID.md](docs/ANDROID.md).

**APK pronto no emulador, de uma vez** — **Windows:** dois cliques em **`ANDROID-WINDOWS.bat`** ·
**Linux:** `./android-linux.sh` · ou `npm run android`. Sobe banco + API, compila o APK
(5 a 20 min na primeira vez), liga o emulador, instala e abre o app. O APK fica em `apk/mobilidade-urbana-sprint01.apk`.

**Pelo botão Run ▶ do Android Studio (debug):**

1. **Windows:** dois cliques em **`ANDROID-STUDIO-WINDOWS.bat`** (sobe banco, API e Metro e abre o Android Studio).
   **Linux:** `npm run db:up && npm run seed && npm run dev:android`.
2. No Android Studio: **File → Open → `mobile/android`**, espere o *Gradle sync*, escolha o emulador e clique em **Run ▶**.

No emulador o app usa a API em `http://10.0.2.2:3333` (o "localhost" do PC visto de dentro do emulador).

---

## 4. Testes e verificação

```bash
npm run check          # lint + tipos + testes da API e do app (o mesmo que o CI roda)
npm test               # 98 testes da API (PostgreSQL real, banco dmr_test) + 30 do app
npm run test:backend -- --coverage
```

**Ponta a ponta (Playwright)** — com a API e o app rodando (`npm run dev` em outro terminal):

```bash
npm run setup -- --e2e     # uma vez: instala o Playwright e o Chromium
npm run test:e2e           # 25 cenários: US01–US13 + robustez (tentativas de quebrar o app)
```

**Verificação completa de uma vez** (instala, sobe o banco, lint/tipos/testes, build, sobe API e app, E2E, vídeo e
a imagem Docker de produção da API com HTTPS obrigatório;
resultado em `verificacao.log`): `npm run verify -- --video` · no Windows, dois cliques em **`VERIFICAR-WINDOWS.bat`**.

**Gravar o vídeo do app** (mesmos pré-requisitos): `npm run video` → `e2e/video/out/tour-sprint-01.webm`
(e `.mp4` se houver ffmpeg). Para usar o Chrome instalado em vez do Chromium do Playwright:
PowerShell `$env:PW_CHANNEL="chrome"; npm run video` · Linux `PW_CHANNEL=chrome npm run video`.

---

## 5. Comandos

| Comando | O que faz |
|---|---|
| `npm start` | tudo de uma vez (setup se precisar, banco, seed, API + app) |
| `npm run setup` | instala dependências, cria `backend/.env` e o certificado HTTPS |
| `npm run db:up` / `db:down` / `db:reset` | sobe / para / apaga e recria o PostgreSQL do Docker |
| `npm run seed` | dados de demonstração (pode rodar de novo: não duplica) |
| `npm run dev` | API + app no navegador · `npm run dev -- --mobile` para o QR Code do Expo Go |
| `npm run dev:api` / `npm run web` / `npm run dev:app` | só a API / só o app web / só o Metro (Expo Go) |
| `npm run android` | Android: banco + API, compila o APK, liga o emulador, instala e abre (`android:apk`, `android:emulador`, `android:instalar` separados) |
| `npm run dev:android` | API + Metro para o botão Run ▶ do Android Studio |
| `npm run certs` | gera de novo o certificado HTTPS local (`-- --force`) |
| `npm test` / `npm run test:e2e` / `npm run check` | testes / ponta a ponta / lint + tipos + testes |
| `npm run build` | compila a API (`backend/dist`) e exporta o app web (`mobile/dist`) |
| `npm run video` | grava o tour do app em vídeo |
| `npm run verify` | verificação completa com log (`-- --video` também grava o vídeo) |

---

## 6. Sem Docker (PostgreSQL instalado)

1. Instale o PostgreSQL 14+ ([Windows](https://www.postgresql.org/download/windows/) ·
   Linux `sudo apt install postgresql`).
2. Crie o usuário e os bancos (no `psql` como superusuário — no Linux `sudo -u postgres psql`):
   ```sql
   CREATE USER dmr WITH PASSWORD 'dmr';
   CREATE DATABASE dmr OWNER dmr;
   CREATE DATABASE dmr_test OWNER dmr;
   ```
3. Em `backend/.env`, troque a porta `5434` por `5432` em `DATABASE_URL` e `TEST_DATABASE_URL`.
4. `npm run setup`, `npm run seed` e `npm run dev` (ou `npm start -- --no-docker`).

---

## 7. Problemas comuns

| Sintoma | Solução |
|---|---|
| `Docker não encontrado` / `não está rodando` | abra o Docker Desktop (Windows) ou `sudo systemctl start docker` (Linux) |
| `porta 5434 já está em uso` | outro PostgreSQL/container está na porta: pare-o ou mude a porta em `docker-compose.yml` e no `backend/.env` |
| `porta 3333/8081 em uso` | feche a execução anterior (Ctrl+C) ou o processo que usa a porta |
| App mostra "Sem conexão com o servidor" | a API não está rodando, ou (no celular) o firewall está bloqueando a porta 3333 |
| `npm run setup` falha no Windows com erro de permissão | feche o VS Code/terminais que estejam usando a pasta e rode de novo |
| Mapa cinza com o aviso "Mapa base indisponível" | sem internet (ou firewall/Portmaster bloqueando `tile.openstreetmap.org` e `server.arcgisonline.com`): trajeto, paradas e localização continuam aparecendo |
| Aviso `EBADENGINE` com Node 25 | só um aviso; o recomendado é o Node 22 LTS (testado também no 25) |
| Android: "Sem conexão com o servidor" no emulador | a API precisa estar rodando no PC (`npm run dev:api`); veja [docs/ANDROID.md](docs/ANDROID.md) |
| Linux: `permission denied` no Docker | `sudo usermod -aG docker $USER` e entre de novo na sessão |

---

## 8. Produção (US13/US14)

- `docker compose --profile prod up -d --build` sobe PostgreSQL + API com **HTTPS obrigatório**
  (`FORCE_HTTPS=true`). Antes, crie um `.env` na raiz com `JWT_SECRET` (32+ caracteres), `POSTGRES_PASSWORD`,
  `SMTP_URL` e aponte `TLS_DIR`/`TLS_CERT`/`TLS_KEY` para o certificado do domínio.
- **Pipeline** (`.github/workflows/ci.yml`): a cada push/PR roda lint, tipos, testes (com PostgreSQL), build e E2E;
  na `main` ou numa tag `v*` publica a imagem da API no GitHub Container Registry e, se os segredos
  `DEPLOY_HOST`, `DEPLOY_USER` e `DEPLOY_SSH_KEY` estiverem configurados, atualiza o servidor por SSH.
- **Git:** histórico por funcionalidade e tag `v0.1.0-sprint1`. Para publicar:
  `git remote add origin <url-do-repositório>` e `git push -u origin main --tags`.

---

## 9. O que ficou para as próximas sprints

Sprint 2: planejamento com baldeação, ônibus em tempo real, notificações, histórico completo de viagens,
avaliações e denúncias, modo offline. Sprint 3: painel administrativo, preferências (tema, unidade, zona),
QR Code, busca por voz, 2FA. Detalhes da entrega: [docs/SPRINT-01.md](docs/SPRINT-01.md).
