# Arquitetura (Sprint 1)

```
┌────────────────────────────┐        HTTPS (3443) / HTTP (3333)       ┌──────────────────────────┐
│ App React Native (Expo)    │  ───────────────────────────────────▶  │ API Node.js (Express 5)  │
│  • Android nativo / Expo Go│      JSON + token JWT (Bearer)          │  • auth / me / transit   │
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
  tempo até a parada (`line_stops.offset_min`). Tempo real é escopo da Sprint 2 (US16).
- **Segurança (US13):** HTTPS no próprio Node (certificado de desenvolvimento gerado por `npm run certs`; em
  produção, o certificado do domínio), `FORCE_HTTPS` redireciona HTTP→HTTPS, HSTS, helmet, CORS configurável,
  limite de tentativas no login e na troca de senha, bcrypt custo 12, tokens de redefinição só como SHA-256,
  JWT invalidado na troca de senha (`token_version`).
- Migrações SQL versionadas em `src/db/migrations`, aplicadas no início da API (com trava para várias réplicas).

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

## Qualidade e entrega (US14)
- Git com histórico por funcionalidade e tag `v0.1.0-sprint1`.
- GitHub Actions (`.github/workflows/ci.yml`): lint → tipos → testes (API com PostgreSQL de serviço, app com
  Jest) → build (API + app web) → E2E Playwright → imagem Docker da API no GHCR → deploy por SSH.
- Scripts em Node (`scripts/*.mjs`) para funcionar igual no Windows e no Linux.
