# Arquitetura (Sprint 2)

```
┌────────────────────────────┐        HTTPS (3443) / HTTP (3333)       ┌──────────────────────────┐
│ App React Native (Expo)    │  ───────────────────────────────────▶  │ API Node.js (Express 5)  │
│  • Android nativo / Expo Go│      JSON + token JWT (Bearer)          │  • auth/me/transit       │
│  • Navegador (react-native │                                         │  • bcrypt, helmet, HSTS  │
│    -web)                   │                                         │  • rede em memória       │
│  • Mapa Leaflet + OSM      │                                         └────────────┬─────────────┘
└────────────────────────────┘                                                      │ pg
                                                                       ┌────────────▼─────────────┐
                                                                       │ PostgreSQL 16 (Docker)   │
                                                                       └──────────────────────────┘
```

## Backend (`backend/`)
- **Node.js 22 + TypeScript + Express 5**, validação com **Zod**, banco **PostgreSQL** via `pg`.
- Módulos por domínio: `modules/auth` (cadastro, login, recuperação), `modules/me` (perfil, favoritos, viagens,
  dashboard), `modules/transit` (linhas, paradas, programação de horários).
- A rede (linhas, paradas, sequência) é carregada uma vez e mantida em memória (`NetworkCache`) — consultas
  rápidas sem ida ao banco a cada busca.
- Horários previstos derivados da programação: partida do ponto inicial (primeiro horário + frequência) somada ao
  tempo até a parada (`line_stops.offset_min`).
- **Segurança (US13):** HTTPS no próprio Node (certificado de desenvolvimento gerado por `npm run certs`; em
  produção, o certificado do domínio), `FORCE_HTTPS` redireciona HTTP→HTTPS, HSTS, helmet, CORS configurável,
  limite de tentativas no login e na troca de senha, bcrypt custo 12, tokens de redefinição só como SHA-256,
  JWT invalidado na troca de senha (`token_version`).
- Migrações SQL versionadas em `src/db/migrations`, aplicadas no início da API (com trava para várias réplicas).

### Sprint 2
| Módulo | Responsabilidade |
|---|---|
| `modules/planner` | US15/US26 — busca de rotas com até 1 baldeação, caminhada e espera; fronteira de Pareto |
| `modules/realtime/simulation.ts` | US16 — viagens do dia com atraso determinístico, posição interpolada, previsões `live` ([ADR-002](adr/ADR-002-tempo-real-simulado.md)) |
| `modules/realtime/service-alerts.ts` | avisos de serviço (atraso/desvio/suspensão) em cache de 10 s |
| `modules/realtime/monitor.ts` | US17/US18 — a cada 30 s gera notificações de avisos, atrasos e proximidade; apaga localizações vencidas |
| `modules/notifications` | histórico, preferências, aparelhos e envio de push plugável ([ADR-003](adr/ADR-003-notificacoes-sem-firebase.md)) |
| `modules/community` | US21–US25 — avaliações, denúncias com protocolo e apoio |
| `modules/share` | US29 — link público temporário (token só em hash) e página sem scripts |
| `lib/dev-tools.ts` | `/dev/simular` (só desenvolvimento, só local) |

Novas tabelas (migração `002_sprint2.sql`): `service_alerts`, `notifications`, `push_devices`, `proximity_alerts`,
`line_ratings`, `reports`, `report_supports`, `location_shares`; `trips` ganhou `kind`, `legs`, `transfers`,
`walk_min`, `completed_at`; `users` ganhou as preferências de notificação.

## App (`mobile/`)
- **Expo SDK 57 / React Native 0.86 / Expo Router** (rotas por arquivo em `src/app`).
- **Android nativo:** `mobile/android/` (gerado por `expo prebuild`, versionado) abre no Android Studio e gera APK
  (`npm run android`); ajustes nativos em `mobile/plugins/`. Ver [ANDROID.md](ANDROID.md).
- Só módulos que também existem no **Expo Go** → o mesmo código roda no celular sem compilar e no navegador.
- Dados com **TanStack Query** (cache, recarregar, atualização otimista dos favoritos).
- **Mapa:** Leaflet embutido (sem CDN) desenhando tiles do OpenStreetMap — sem chave de API; se o OSM falhar, troca
  sozinho para o mapa de ruas da Esri (também sem chave). A mesma página
  roda numa WebView (celular) ou num iframe (navegador) e conversa com o app por mensagens.
- **Localização (US10):** `expo-location` (no navegador, a API de geolocalização).
- Endereço da API descoberto automaticamente (mesmo computador do Metro) ou por `EXPO_PUBLIC_API_URL`.
- **Sprint 2:** cache persistente no aparelho e modo offline ([ADR-004](adr/ADR-004-offline.md)); notificações do
  sistema com `expo-notifications` (`components/NotificationsBridge.tsx`); ônibus ao vivo e cache de tiles no mapa;
  compartilhamento pela folha do sistema (`Share`); Android mínimo 7.0 ([ADR-001](adr/ADR-001-android-minimo.md)).

## Qualidade e entrega (US14)
- Git com histórico por funcionalidade e tags `v0.1.0-sprint1` (na pasta da Sprint 1) e `v0.2.0-sprint2`.
- Backups automáticos a cada 24 h (serviço `backup` do compose) — [BACKUP.md](BACKUP.md).
- GitHub Actions (`.github/workflows/ci.yml`): lint → tipos → testes (API com PostgreSQL de serviço, app com
  Jest) → build (API + app web) → E2E Playwright → imagem Docker da API no GHCR → deploy por SSH.
- Scripts em Node (`scripts/*.mjs`) para funcionar igual no Windows e no Linux.
