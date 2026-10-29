# Sprint 2 — entrega e rastreabilidade

**Objetivo da sprint:** transformar o app de consulta em companheiro de viagem — planejar rotas com baldeação,
acompanhar o ônibus em tempo real, receber avisos de atrasos e de chegada, guardar o histórico, avaliar e denunciar
problemas, compartilhar a localização e usar o app sem internet — com backups automáticos e compatibilidade Android.

**Total:** 17 user stories · 65 pontos · todas concluídas (US31 com a ressalva registrada no ADR-001).

| ID | User story | Pts | Status |
|---|---|:-:|:-:|
| US15 | Planejar viagem (origem/destino) com baldeações | 8 | ✅ |
| US16 | Localização dos ônibus em tempo real | 8 | ✅ ¹ |
| US17 | Notificações de atrasos e mudanças de itinerário | 5 | ✅ ² |
| US18 | Alertas de proximidade do ônibus | 5 | ✅ |
| US19 | Histórico de viagens | 3 | ✅ |
| US20 | Histórico de notificações | 2 | ✅ |
| US21 | Avaliar linha com nota e comentário | 3 | ✅ |
| US22 | Média de avaliações por linha | 2 | ✅ |
| US23 | Denunciar problemas em linha/veículo | 3 | ✅ |
| US24 | Ver denúncias de outros usuários | 3 | ✅ |
| US25 | Confirmação de denúncia registrada | 1 | ✅ |
| US26 | Tempo estimado de viagem | 3 | ✅ |
| US27 | Linhas e horários offline | 8 | ✅ |
| US28 | Cache das imagens do mapa | 3 | ✅ |
| US29 | Compartilhar localização/rota com um contato | 3 | ✅ |
| US30 | Backups automáticos a cada 24 h | 3 | ✅ |
| US31 | Compatibilidade com Android 5.0+ | 2 | ✅ ³ |

¹ A rede de demonstração não tem GPS embarcado: a posição e o atraso são **simulados** a partir da programação,
de forma determinística (ADR-002). Trocar por um feed real (GTFS-Realtime/AVL) é uma implementação nova de
`tripInstances`, sem mudar API nem app.
² Sem projeto Firebase, o push remoto fica desligado: o app busca as notificações na API e as mostra como notificação
do sistema (app aberto ou recém-minimizado). Com o `google-services.json`, basta `PUSH_PROVIDER=expo` (ADR-003,
[NOTIFICACOES.md](NOTIFICACOES.md)).
³ O React Native 0.86/Expo 57 exige **Android 7.0 (API 24)**; Android 5/6 só seria possível voltando a um RN de 2023,
sem suporte. Decisão aprovada pelo Lucas: mínimo 24, declarado e testado (ADR-001).

## Verificação da Sprint 1 (antes de começar)

A pasta `Sprint01` (zip do GitHub) passava nos testes da API (98) e do app (31), mas tinha **três arquivos
sobrescritos por outros** — corrigidos no primeiro commit desta sprint:

| Arquivo | Problema | Efeito |
|---|---|---|
| `mobile/src/app/_layout.tsx` | era cópia de `(tabs)/_layout.tsx` (imports `../../` inexistentes) | o app não abria; `tsc` e `eslint` falhavam |
| `package.json` (raiz) | era cópia de `backend/package.json` | `npm start`, `setup`, `db:up`, `check`, `android`… não existiam (os `.bat` quebravam) |
| `mobile/android/build.gradle` | era cópia de `app/build.gradle` | o Gradle sync do Android Studio falhava |

O `build.gradle` foi regenerado com `expo prebuild` (todos os outros arquivos nativos bateram). Também faltavam
`e2e/video/tour.mjs` e os guias citados no README — recriados ([GUIA-DO-PROJETO.md](GUIA-DO-PROJETO.md),
[ROTEIRO-APRESENTACAO.md](ROTEIRO-APRESENTACAO.md)).

## Números

| | Sprint 1 | Sprint 2 |
|---|:-:|:-:|
| Testes da API (Vitest + PostgreSQL real) | 98 | **162** (cobertura 95 % das linhas) |
| Testes do app (Jest) | 31 | **52** (82 % das linhas dos módulos de lógica) |
| Cenários ponta a ponta (Playwright) | 25 | **33** |
| Telas do app | 13 | **25** |

## Critérios de aceite, implementação e evidências

Testes em `backend/test/`, `mobile/src/**/__tests__/` + `mobile/tests/` e `e2e/tests/sprint2.spec.ts`.
O vídeo `e2e/video/out/tour-sprint-02.mp4` (`npm run video`) percorre as histórias abaixo; os prints ficam em
[docs/prints/sprint2](prints/sprint2).

### US15 — Planejar viagem com baldeação
- **Aceite:** origem = minha localização ou um ponto; destino = um ponto; até 1 baldeação (a pé até 350 m entre
  pontos); opções em ordem de chegada com etiquetas "Mais rápida", "Menos caminhada", "Menos baldeações", "A pé",
  "Mais tarde"; nunca sugere baldear para o mesmo ônibus que dava para pegar direto; em linha circular embarca na
  passagem certa; horário de saída "agora", +15, +30 ou +60 min; salvar a opção no histórico.
- **API:** `GET /api/v1/plan?fromStopId|fromLat&fromLng&toStopId|toLat&toLng&at` → `modules/planner/planner.ts`
  (busca exaustiva + fronteira de Pareto em chegada/baldeações/caminhada/saída; ~2 ms por consulta)
- **App:** `app/plan.tsx` + `components/PlacePicker.tsx` (Início → "Para onde vamos?"; ponto → "Como chegar aqui")
- **Testes:** `planner.test.ts` (11) · E2E `US15/US26 — planejar viagem…`

### US16 — Ônibus em tempo real
- **Aceite:** posição dos ônibus da linha no mapa, atualizada a cada 5 s, com rumo e cor (verde no horário, laranja
  atrasado); contagem regressiva até o ponto escolhido; próximas paradas do ônibus que vem; previsões das paradas
  passam a somar o atraso (`live`, `delayMin`, `scheduledAt`).
- **API:** `GET /lines/:id/vehicles?stopId=` · previsões em `GET /lines/:id`, `GET /stops/:id`, dashboard →
  `modules/realtime/simulation.ts`
- **App:** `app/live/[lineId].tsx` · ônibus também no mapa da linha · `components/map/html.ts` (ícone com número)
- **Testes:** `realtime.unit.test.ts` · `realtime.test.ts` · E2E `US16 — acompanhar o ônibus…`

### US17 — Notificações de atrasos e mudanças de itinerário
- **Aceite:** avisos de serviço (atraso anunciado, desvio, suspensão) notificam quem tem a linha favorita (até 12 h
  antes); atraso de 5+ min numa favorita avisa no máximo 1×/hora por linha; nada se repete (chave de deduplicação);
  preferências por tipo; avisos aparecem no Início, na linha, no ponto e no acompanhamento ao vivo.
- **API:** monitor a cada `MONITOR_INTERVAL_S` (`modules/realtime/monitor.ts`) · `GET/PATCH /me/notification-settings`
  · `PUT/DELETE /me/devices` · `GET /service-alerts` · push plugável (`modules/notifications/push.ts`)
- **App:** `components/NotificationsBridge.tsx` (busca as novas a cada 20 s e mostra no sistema; toque abre a tela
  certa) · `app/notification-settings.tsx` · canal Android "Atrasos e alertas de ônibus"
- **Demonstração:** `http://localhost:3333/dev/simular` cria um aviso numa linha (só em desenvolvimento, só no PC)
- **Testes:** `notifications.test.ts` · `devtools.test.ts` · E2E `US17/US20 — aviso de itinerário…`

### US18 — Alertas de proximidade
- **Aceite:** escolher linha, ponto, minutos de antecedência (1–30) e horário opcional (manhã, fim da tarde ou dia
  todo, inclusive virando a meia-noite); avisa uma vez por ônibus; ativar/desativar e apagar; até 20 alertas.
- **API:** `GET/POST/PATCH/DELETE /me/alerts` → `modules/realtime/proximity-routes.ts`
- **App:** `app/alerts/index.tsx`, `app/alerts/new.tsx` (atalhos no ponto e no "Ao vivo")
- **Testes:** `notifications.test.ts › US18` · `realtime.unit.test.ts › janela` · E2E `US18 — criar alerta…`

### US19 — Histórico de viagens
- **Aceite:** viagens planejadas (do planejador, com baldeação) e realizadas; filtros por tipo e período; resumo
  (viagens, tempo, distância); paginação; "Fiz esta viagem" transforma planejada em realizada; apagar. Só as
  realizadas contam no dashboard.
- **API:** `GET /me/trips?kind&from&to&lineId&before` (com `meta.summary`) · `POST /me/trips/planned` ·
  `POST /me/trips/:id/complete` · `DELETE /me/trips/:id`
- **App:** `app/history.tsx` (linha do tempo do UI kit)
- **Testes:** `history.test.ts` · E2E (dentro de US15)

### US20 — Histórico de notificações
- **Aceite:** "Alertas" (não lidas) e "Histórico" (todas, paginado); marcar como lida/todas; apagar uma (segurar) ou
  limpar; contador no sininho; guarda as 200 mais recentes.
- **API:** `GET /me/notifications?unread&type&before&since` · `POST /me/notifications/read` ·
  `DELETE /me/notifications/:id` · `DELETE /me/notifications`
- **App:** `app/notifications.tsx` · sininho no Início · Perfil
- **Testes:** `notifications.test.ts › US20` · E2E `US17/US20`

### US21 / US22 — Avaliação e média
- **Aceite:** nota de 1 a 5 com comentário opcional (até 500 caracteres); uma avaliação por pessoa (avaliar de novo
  substitui); média com uma casa, total e distribuição; comentários com nome público "Marina A."; média na lista de
  linhas e no detalhe.
- **API:** `GET /lines/:id/ratings` · `PUT/DELETE /lines/:id/rating` · `rating` em `/lines` → `modules/community/ratings.ts`
- **App:** `app/lines/[id]/rate.tsx` · cartão "Avaliação" na linha · selo ★ no `LineCard`
- **Testes:** `community.test.ts › US21/US22` · E2E `US21/US22`

### US23 / US24 / US25 — Denúncias
- **Aceite:** tipos (superlotação, atraso, veículo, motorista, limpeza, segurança, ponto, outro — "outro" exige
  descrição); parada opcional; protocolo `DEN-AAAA-NNNNNN` na tela e nas notificações (US25); denúncias da linha
  dos últimos 7/30 dias sem identificar o autor, com resumo por tipo e "Também passei por isso" (US24); limites:
  a mesma denúncia em 30 min e no máximo 10 por hora.
- **API:** `POST /reports` · `GET /me/reports` · `GET /lines/:id/reports?days` · `PUT/DELETE /reports/:id/support`
- **App:** `app/lines/[id]/report.tsx` · `app/lines/[id]/reports.tsx` · atalho no ponto
- **Testes:** `community.test.ts › US23–US25` · E2E `US23/US25 — denunciar…`

### US26 — Tempo estimado de viagem
- **Aceite:** cada opção mostra o tempo total (caminhada + espera + ônibus, com o atraso atual), "Sair às" e
  "chegar às" (e "Amanhã" quando é no dia seguinte); a viagem registrada mostra o tempo entre as paradas.
- **API/App:** campos `durationMin/departAt/arriveAt/walkMin/waitMin/rideMin` do `/plan`
- **Testes:** `planner.test.ts` (tempo total = trechos + espera) · E2E US15

### US27 — Offline
- **Aceite:** o que foi aberto fica salvo no aparelho por 7 dias; "Usar sem internet" baixa a rede inteira; sem
  conexão, uma faixa avisa, linhas e paradas continuam (busca e ordenação no aparelho) e os próximos horários são
  calculados no aparelho pela programação; ao voltar a conexão tudo é atualizado; sair da conta apaga os dados salvos.
- **App:** `lib/query.tsx` (React Query + AsyncStorage), `lib/network.ts`, `lib/offline.ts`, `lib/schedule.ts`,
  `components/OfflineBanner.tsx`, `app/offline.tsx`
- **Testes:** `sprint2.test.ts`, `offline.test.ts` · E2E `US27 — baixar a rede…` (rede cortada no navegador)

### US28 — Cache das imagens do mapa
- **Aceite:** cada tile baixado é guardado no aparelho (até ~1.500, os mais antigos saem) e reaproveitado sem rede;
  na WebView do Android também vale o cache HTTP (`LOAD_CACHE_ELSE_NETWORK`); "Apagar dados salvos" limpa.
- **App:** `components/map/html.ts` (camada `CachedTiles` com Cache API) · `TransitMap.tsx`
- **Testes:** `sprint2.test.ts › mapa`

### US29 — Compartilhar localização/rota
- **Aceite:** link temporário (15 min a 2 h) enviado pelo WhatsApp/SMS (folha de compartilhamento); o contato abre
  sem conta e vê a posição no mapa, a linha e a chegada prevista; a posição é atualizada a cada 30 s com o app
  aberto; "Parar" encerra; encerrado/expirado não mostra mais onde a pessoa está e a posição é apagada do banco.
- **API:** `POST/GET /me/shares` · `PUT /me/shares/:id/position` · `DELETE /me/shares/:id` · página pública
  `GET /s/:token` e `GET /api/v1/shares/:token` (token de 192 bits, só o hash no banco, CSP sem scripts)
- **App:** `app/share.tsx`, `lib/share.ts`
- **Testes:** `share.test.ts` · E2E `US29 — compartilhar localização…`

### US30 — Backups a cada 24 h
- **Aceite:** backup completo automático a cada 24 h, conferido (`pg_restore --list`), com retenção configurável e
  destino no servidor secundário (pasta de rede ou `BACKUP_POST_CMD`); backup e restauração manuais.
- **Infra:** serviço `backup` do `docker-compose.yml` + `infra/backup/backup.sh` · `npm run backup`,
  `backup:list`, `restore` (`scripts/backup.mjs`) · CI gera e confere um backup · [BACKUP.md](BACKUP.md)

### US31 — Compatibilidade Android
- **Aceite:** mínimo declarado (minSdk 24 = Android 7.0) no `app.config.ts` e no projeto nativo; permissão de
  notificações (Android 13+); teste automático confere tudo.
- **Evidências:** `mobile/tests/compat.test.ts` · [ADR-001](adr/ADR-001-android-minimo.md)

## Revisões feitas

- **Segurança (revisor independente):** nenhum achado crítico/alto. Corrigidos: token do link nos logs, limite de
  compartilhamentos sob concorrência, retenção da localização (LGPD), limites por usuário (escritas, aparelhos,
  viagens), ferramentas de dev contra proxy/CSRF, `PUBLIC_SHARE_URL` obrigatório em produção.
- **App (revisor React independente):** corrigidos mapa redesenhado a cada segundo, polling/GPS em telas fora de
  foco, chaves de cache por posição (Início offline), vazamento de GPS, guarda de sessão em todas as telas, corridas no
  polling de notificações, logout incompleto, contagem regressiva imprecisa (API passou a mandar `etaAt`) e outros.
- **Testes de ponta a ponta** encontraram e corrigiram: cache restaurado tratado como "fresco" ao recarregar
  (favorita recém-marcada não aparecia) e máscara de log cortando ids.

## Como demonstrar

```bash
npm start                  # banco, seed, API e app (http://localhost:8081) — conta marina@email.com / Senha@123
# outra aba: http://localhost:3333/dev/simular  → cria um atraso/desvio e dispara as notificações
npm run test:e2e           # 33 cenários (com a API e o app no ar)
npm run video              # grava o tour e gera os prints
```
