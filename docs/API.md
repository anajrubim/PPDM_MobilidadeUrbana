# API — referência (Sprint 1)

Base: `http://localhost:3333/api/v1` (HTTPS: `https://localhost:3443/api/v1`).
Respostas de sucesso: `{ "data": ... }`. Erros: `{ "error": { "code", "message", "details?" } }`.
Rotas marcadas com 🔒 exigem `Authorization: Bearer <token>`.

## Saúde
| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | `{ status, time, version, https }` |

## Autenticação (US01–US03)
| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password }` | 201 `{ token, user }` · 409 `email_taken` · 422 validação |
| POST | `/auth/login` | `{ email, password }` | 200 `{ token, user }` · 401 |
| POST | `/auth/forgot-password` | `{ email }` | 202 (mesma resposta exista ou não a conta) · 503 se o SMTP falhar |
| POST | `/auth/reset-password` | `{ token, password }` | 204 · 400 link inválido/expirado/usado |

Senha: 8 a 128 caracteres, com letras e números. Limite de 30 tentativas a cada 15 min por IP em produção.

## Conta 🔒 (US04)
| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/me` | — | usuário |
| PATCH | `/me` | `{ name }` | usuário atualizado |
| POST | `/me/password` | `{ currentPassword, newPassword }` | `{ token, user }` (sessões antigas invalidadas) · 400 `wrong_password` |

## Linhas e paradas (US05–US09) — públicas; com token, marcam `isFavorite`
| Método | Rota | Parâmetros | Descrição |
|---|---|---|---|
| GET | `/lines` | `q`, `serviceType`, `includeInactive` | lista/busca (número exato primeiro, sem acentos) |
| GET | `/lines/:id` | — | detalhe: `shape` [[lat,lng]], `lengthM`, `durationMin`, `stops[]` com `nextArrival` |
| GET | `/stops` | `q`, `sort=name\|distance\|lines`, `lat`, `lng`, `limit` | pontos de parada |
| GET | `/stops/:id` | — | linhas da parada com `arrivals` (próximas 3) e `timetable` do dia |

## Favoritos, viagens e dashboard 🔒 (US11, US12)
| Método | Rota | Corpo/parâmetros | Descrição |
|---|---|---|---|
| GET | `/me/favorites` | — | linhas favoritas |
| PUT | `/me/favorites/:lineId` | — | favorita (idempotente) |
| DELETE | `/me/favorites/:lineId` | — | remove (204) |
| GET | `/me/trips` | `limit` | viagens registradas |
| POST | `/me/trips` | `{ lineId, originStopId, destStopId }` | registra; duração/distância calculadas pelo trajeto |
| GET | `/me/dashboard` | `lat`, `lng` (opcionais) | `{ favorites, nextDepartures, trips: { last30Days, total, mostUsedLine, recent } }` |

## Somente desenvolvimento
| Rota | Descrição |
|---|---|
| `GET /dev/emails` | caixa de e-mails (página HTML) quando `SMTP_URL` está vazio |
| `GET /api/v1/dev/emails` | a mesma caixa em JSON (usada pelos testes E2E) |
