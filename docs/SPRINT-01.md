# Sprint 1 — entrega e rastreabilidade

**Objetivo da sprint:** base do produto — contas de usuário, consulta de linhas e paradas, mapa com trajeto e
localização, favoritos e um dashboard inicial, sobre uma API segura com versionamento e pipeline automatizados.

**Total:** 14 user stories · 48 pontos · todas concluídas.

| ID | User story | Pts | Status |
|---|---|:-:|:-:|
| US01 | Cadastro com nome, e-mail e senha | 3 | ✅ |
| US02 | Login com e-mail e senha | 3 | ✅ |
| US03 | Recuperar senha por e-mail | 3 | ✅ |
| US04 | Editar nome e senha | 2 | ✅ |
| US05 | Lista de todas as linhas | 3 | ✅ |
| US06 | Busca de linha por nome ou número | 3 | ✅ |
| US07 | Trajeto da linha no mapa | 5 | ✅ |
| US08 | Lista de pontos de parada | 3 | ✅ |
| US09 | Linhas que passam na parada e horários previstos | 5 | ✅ |
| US10 | Localização atual no mapa | 3 | ✅ |
| US11 | Favoritar linha | 2 | ✅ |
| US12 | Dashboard com resumo de viagens e favoritos | 5 | ✅ |
| US13 | API Node.js com HTTPS e senhas hasheadas | 5 | ✅ |
| US14 | Versionamento Git e pipeline de build/deploy | 3 | ✅ |

## Critérios de aceite, implementação e evidências

Os testes citados ficam em `backend/test/` (Vitest + Supertest contra PostgreSQL real), `mobile/src/**/__tests__/`
(Jest) e `e2e/tests/sprint1.spec.ts` (Playwright no app web contra a API real). O vídeo
`video/tour-sprint-01.mp4` percorre todas as histórias na ordem abaixo, com legenda de cada uma.

### US01 — Cadastro
- **Aceite:** nome, e-mail e senha obrigatórios; e-mail válido e único (sem diferenciar maiúsculas); senha com 8+
  caracteres, letras e números; depois do cadastro o usuário já entra no app.
- **API:** `POST /api/v1/auth/register` → `backend/src/modules/auth/routes.ts`
- **App:** `mobile/src/app/register.tsx` (validação imediata em `lib/validation.ts`)
- **Testes:** `auth.test.ts › US01` (5 cenários de validação, e-mail repetido, sessão devolvida) · `logic.test.ts` ·
  E2E `US01 — cadastro…` e `US01 — e-mail já cadastrado…`

### US02 — Login
- **Aceite:** entra com e-mail e senha; erro genérico ("E-mail ou senha incorretos") sem revelar se a conta existe;
  sessão mantida ao reabrir o app; sair da conta.
- **API:** `POST /api/v1/auth/login` (JWT de 30 dias, invalidado se a senha mudar) · `GET /api/v1/me`
- **App:** `mobile/src/app/login.tsx` · sessão em `lib/app-state.tsx` (token no armazenamento seguro do aparelho)
- **Testes:** `auth.test.ts › US02` · `api.test.ts` (401 desloga) · E2E `US02 — login, senha errada e sessão…`

### US03 — Recuperar senha por e-mail
- **Aceite:** o usuário informa o e-mail e recebe um link válido por 1 hora e de uso único; a resposta não revela se
  o e-mail existe; ao trocar a senha, as sessões antigas deixam de valer.
- **API:** `POST /auth/forgot-password` e `POST /auth/reset-password`; no banco fica só o SHA-256 do token.
  Envio por SMTP (`SMTP_URL`); sem SMTP, os e-mails vão para a caixa de desenvolvimento
  `http://localhost:3333/dev/emails` (desligada em produção).
- **App:** `forgot-password.tsx` e `reset-password.tsx` (aberto pelo link do e-mail)
- **Testes:** `auth.test.ts › US03` (link, uso único, expiração, não revela conta, falha de SMTP) ·
  `mailer.test.ts` · E2E `US03 — recuperar senha pelo link…`

### US04 — Editar nome e senha
- **Aceite:** altera o nome; troca a senha conferindo a atual; senha atual errada não derruba a sessão;
  outros aparelhos precisam entrar de novo.
- **API:** `PATCH /api/v1/me` · `POST /api/v1/me/password`
- **App:** Perfil → "Editar nome e senha" (`mobile/src/app/account.tsx`)
- **Testes:** `me.test.ts` · E2E `US04 — editar nome e senha`

### US05 — Lista de linhas
- **Aceite:** todas as linhas ativas, com número, nome, nº de paradas, frequência e horário de operação.
- **API:** `GET /api/v1/lines` · **App:** aba **Linhas** (`(tabs)/lines.tsx`, `components/LineCard.tsx`)
- **Testes:** `transit.test.ts › US05` · `LineCard.test.tsx` · E2E `US05/US06`

### US06 — Busca por nome ou número
- **Aceite:** filtra enquanto digita; número exato primeiro; ignora acentos e maiúsculas; busca também por
  origem/destino; mensagem quando não há resultado.
- **API:** `GET /api/v1/lines?q=` · **App:** campo de busca da aba Linhas (espera 250 ms entre teclas)
- **Testes:** `transit.test.ts › US06` · E2E `US05/US06`

### US07 — Trajeto no mapa
- **Aceite:** o detalhe da linha mostra o trajeto desenhado no mapa, com as paradas, início e fim destacados.
- **API:** `GET /api/v1/lines/:id` (trajeto `shape`, comprimento e duração)
- **App:** `lines/[id]/index.tsx` + `components/map` — Leaflet com mapa do OpenStreetMap (sem chave de API).
  O mesmo mapa roda no navegador (iframe) e no celular (WebView — no APK nativo e no Expo Go).
- **Testes:** `transit.test.ts › US07/US08` · `map.test.ts` · E2E `US07/US08` (confere a polilinha e os marcadores)

### US08 — Lista de pontos de parada
- **Aceite:** todos os pontos, com busca por nome/código e ordenação por distância, ordem alfabética ou nº de linhas;
  o detalhe da linha lista as paradas em ordem.
- **API:** `GET /api/v1/stops?q=&sort=&lat=&lng=` · **App:** aba **Paradas** (`(tabs)/stops.tsx`)
- **Testes:** `transit.test.ts › US08` · E2E `US08 — lista de pontos…`

### US09 — Linhas da parada e horários previstos
- **Aceite:** na parada aparecem as linhas que passam, a próxima chegada (em minutos e horário), as seguintes e a
  tabela do dia; linhas circulares não se repetem; depois do último ônibus mostra o primeiro do dia seguinte.
- **API:** `GET /api/v1/stops/:id` · previsão pela programação (`modules/transit/schedule.ts`)
- **App:** `stops/[id].tsx` (toque na linha expande a tabela)
- **Testes:** `transit.test.ts › US09` · `schedule.unit.test.ts` · E2E `US09`

### US10 — Localização atual no mapa
- **Aceite:** a aba Mapa mostra o ponto azul da posição atual (acompanha o movimento), botão para centralizar,
  pontos mais próximos e aviso quando a permissão é negada.
- **App:** aba **Mapa** (`(tabs)/map.tsx`, `lib/location.ts` com `expo-location`; no navegador usa a geolocalização)
- **Testes:** `map.test.ts` · E2E `US10 — minha localização…` e `US10 — sem permissão…`

### US11 — Favoritar linha
- **Aceite:** estrela na lista e no detalhe; a linha aparece em "★ Favoritas", no início e no mapa; desfazer;
  favoritos são por usuário.
- **API:** `GET/PUT/DELETE /api/v1/me/favorites/:lineId` · **App:** `lib/favorites.ts` (atualiza a tela na hora)
- **Testes:** `transit.test.ts › US11` · `favorites.test.ts` · E2E `US11`

### US12 — Dashboard
- **Aceite:** a tela inicial mostra o resumo das viagens dos últimos 30 dias (quantidade, tempo, distância, linha
  mais usada), as viagens recentes, as linhas favoritas e a próxima partida de cada uma no ponto mais perto do
  usuário. O usuário registra uma viagem escolhendo embarque e desembarque numa linha.
- **API:** `GET /api/v1/me/dashboard` · `POST /api/v1/me/trips` (duração e distância calculadas pelo trajeto)
- **App:** aba **Início** (`(tabs)/home.tsx`) · `lines/[id]/trip.tsx`
- **Testes:** `dashboard.test.ts` · E2E `US12` (dois cenários)
- **Observação:** o histórico completo de viagens e o planejador de rotas são das US19/US15 (Sprint 2); nesta sprint
  o registro de viagem é manual e alimenta o resumo.

### US13 — API Node.js com HTTPS e senhas hasheadas
- **Aceite:** API em Node.js servindo HTTPS; HTTP redirecionado quando `FORCE_HTTPS=true` (padrão em produção);
  HSTS e cabeçalhos de segurança; senhas só como hash bcrypt (custo 12, sal aleatório); tokens de redefinição
  guardados como SHA-256; limite de tentativas no login.
- **Onde:** `backend/src/server.ts` (HTTP 3333 + HTTPS 3443), `scripts/gen-certs.mjs` (certificado de
  desenvolvimento sem OpenSSL), `lib/password.ts`, `app.ts` (helmet, redirecionamento), `docker-compose.yml` (prod)
- **Testes:** `security.test.ts` (servidor TLS real, HSTS, redirecionamento, bcrypt, configuração de produção) ·
  `auth.test.ts` (hash no banco) · E2E `US13`

### US14 — Git e pipeline de build/deploy
- **Aceite:** código versionado em Git com histórico por funcionalidade; pipeline que, a cada push/PR, roda lint,
  tipos, testes e build, e publica/implanta automaticamente a partir da `main` ou de uma tag.
- **Onde:** repositório Git desta pasta (tag `v0.1.0-sprint1`); `.github/workflows/ci.yml` com os jobs
  `backend` (PostgreSQL de serviço) → `mobile` → `e2e` (Playwright) → `publish` (imagem Docker no GHCR) →
  `deploy` (SSH, quando os segredos `DEPLOY_HOST/USER/SSH_KEY` existem); `backend/Dockerfile`.
- **Verificação:** workflow validado com `actionlint`; os mesmos comandos do CI rodam localmente com `npm run check`.

## Resultado da verificação

Rodado do zero (clone limpo → `npm run verify`) nos dois sistemas:

| Verificação | Linux (Ubuntu, Node 22) | Windows 11 (Node 25, Docker Desktop) |
|---|---|---|
| Instalação (`npm run setup -- --e2e`) | ✅ | ✅ |
| Banco no Docker + seed | ✅ (PostgreSQL local) | ✅ |
| Testes da API (Vitest, PostgreSQL real) | 98 ✅ · cobertura ≈ 90% | 98 ✅ |
| Testes do app (Jest) | 30 ✅ | 30 ✅ |
| Lint (ESLint) e tipos (TypeScript) | sem erros | sem erros |
| Build da API + exportação do app web | ✅ | ✅ |
| Ponta a ponta (Playwright, app web + API) | 25 ✅ | 25 ✅ |
| Tour em vídeo de todas as telas | 0 erros, 0 passos falhos | 0 erros, 0 passos falhos (vídeo entregue) |
| Imagem Docker de produção da API (build, HTTP→HTTPS 308, TLS 200) | — (sem Docker no ambiente) | ✅ |
| Fuzz da API (484 requisições malformadas em todas as rotas) | 0 erros 5xx | — |
| Workflow do GitHub Actions (actionlint) | sem erros | — |
| **App Android nativo** (APK de release no emulador Pixel 7 do Android Studio) | — (sem Android SDK no ambiente) | ✅ compila em ~8 min (1ª vez) / ~1 min; login, dashboard, linhas, busca, favoritar, mapa com GPS, paradas e horários testados no emulador |
| **Android Studio** (abrir `mobile/android`, Gradle sync, Run ▶ → build de debug e instalação no emulador) | — | ✅ (Android Studio 2026.1, Java do Gradle fixado em 17) |

Problemas encontrados e corrigidos durante a verificação: senha atual errada derrubava a sessão (401 → 400),
botão dentro de botão no cartão de linha (HTML inválido na web), e-mail com espaço no fim recusado no login,
`docker compose up db` exigindo `JWT_SECRET` no Windows, e tiles da CARTO passando a exigir chave
(trocado por OpenStreetMap com reserva da Esri). No Android: caminho do build nativo acima de 260 caracteres no
Windows (build C++ movido para uma pasta curta pelo plugin `with-short-native-path`) e o aviso "precisão de local" do
Google aparecendo a cada tela que usa o GPS (desligado; o app usa o GPS direto e a última posição conhecida) e o
Gradle sync do Android Studio falhando com o Java 25 que vem nele (Gradle fixado em Java 17).

### Teste de robustez (tentando quebrar o app)

Depois da entrega, o app foi atacado como um usuário mal-intencionado faria. Brechas encontradas e corrigidas
(cada uma virou teste automatizado em `backend/test/abuse.test.ts` e `e2e/tests/robustez.spec.ts`):

| # | O que dava para fazer | Correção |
|---|---|---|
| 1 | **Burlar o limite de tentativas de login** mandando um `X-Forwarded-For` diferente a cada tentativa (força bruta ilimitada) e fingir HTTPS com `X-Forwarded-Proto` | a API só confia nesses cabeçalhos com `TRUST_PROXY` configurado (padrão: nenhum proxy) |
| 2 | Qualquer pessoa na mesma rede Wi-Fi abria a **caixa de e-mails de desenvolvimento** e pegava links de redefinição de senha de outras contas | `/dev/emails` só responde para o próprio computador |
| 3 | Senha com mais de 72 bytes: o bcrypt ignora o resto, então **outra senha com o mesmo começo entrava** | limite de 72 bytes na API e no app |
| 4 | Um link antigo de "esqueci minha senha" **continuava valendo depois de trocar a senha** (desfazia a troca) | trocar ou redefinir a senha invalida todos os links abertos |
| 5 | Id gigante na URL (`/me/favorites/99999999999`) derrubava a API com **erro 500** | ids validados no limite do banco |
| 6 | Linha **desativada** podia ser favoritada e receber viagens | API recusa (409) e o app esconde estrela e botão |
| 7 | Nome feito só de **caracteres invisíveis** (ou só números) era aceito | caracteres de controle/invisíveis removidos; nome precisa ter letras |
| 8 | Cadastro duplicado ao mesmo tempo devolvia erro genérico | trata como "e-mail já cadastrado" |
| 9 | **Duplo clique** em "Criar minha conta", "Entrar", "Confirmar viagem" etc. enviava duas vezes | envio único por ação |
| 10 | Abrir `/account` ou `/lines/:id/trip` direto sem estar logado mostrava a tela quebrada | redireciona para o login |
| 11 | Link de redefinição adulterado mostrava mensagem técnica em inglês ("Too small…") | link inválido detectado no app; mensagens de validação da API em português |
| 12 | Busca com texto enorme mostrava "Não foi possível carregar as linhas" | campos com limite de tamanho |
| 13 | Falha ao favoritar (ex.: linha desativada) desfazia a estrela sem avisar; toques rápidos podiam deixar a tela diferente do servidor | aviso na tela e recarga das listas depois de cada toque |

Também conferido e já seguro: injeção de SQL e de HTML/script na busca e no nome, JSON inválido, corpo enorme,
token adulterado ou de conta apagada, sessão encerrada em outro aparelho, voltar no navegador depois de sair.

Prints de todas as telas em [`docs/prints/`](prints/).

## Fora do escopo (próximas sprints)

Planejamento de viagem com baldeação, ônibus em tempo real, notificações, histórico completo, avaliações,
denúncias, modo offline (Sprint 2) · painel administrativo, preferências, QR Code, voz, 2FA (Sprint 3).
