# API — referência (Sprints 1 e 2)

Base: `http://localhost:3333/api/v1` (HTTPS: `https://localhost:3443/api/v1`).
Respostas de sucesso: `{ "data": ... }`. Erros: `{ "error": { "code", "message", "details?" } }`.
Rotas marcadas com 🔒 exigem `Authorization: Bearer <token>`.

## Saúde
| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | `{ status, app, time, version, https }` |

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
| GET | `/me/dashboard` | `lat`, `lng` (opcionais) | `{ favorites, nextDepartures, trips: { last30Days, total, mostUsedLine, recent }, unreadNotifications, alerts }` (só viagens realizadas) |

> **Sprint 2 — previsões:** `nextArrival`, `arrivals` e `nextDepartures` agora são `{ inMin, at, scheduledAt, delayMin, live, tripId }`:
> `at` já soma o atraso dos ônibus em circulação (`live: true`) e dos avisos de serviço ativos. `GET /stops/:id` traz
> também `offsets` (para o cálculo offline) e `alerts` por linha; `GET /lines` e `/lines/:id` trazem `rating`;
> `/lines/:id` traz `vehiclesCount` e `alerts`.

## Planejamento e tempo real (US15, US16, US26) — públicas
| Método | Rota | Parâmetros | Descrição |
|---|---|---|---|
| GET | `/plan` | `fromStopId` ou `fromLat`+`fromLng`(+`fromLabel`); `toStopId` ou `toLat`+`toLng`(+`toLabel`); `at` (ISO, até +24 h) | `{ from, to, at, options[] }`; cada opção: `departAt, arriveAt, durationMin, walkMin, waitMin, rideMin, transfers, walkM, tags[], legs[]` (trechos `walk`/`bus`, com `path` para o mapa) |
| GET | `/lines/:id/vehicles` | `stopId` (opcional) | ônibus em circulação `{ lat, lng, heading, delayMin, departedAt, nextStop, progress }`; com `stopId`, `stop.arrivals` |
| GET | `/service-alerts` | — | avisos ativos/programados (atraso, desvio, suspensão) |

## Viagens — histórico (US19) 🔒
| Método | Rota | Corpo/parâmetros | Descrição |
|---|---|---|---|
| GET | `/me/trips` | `limit`, `kind` (`planned`/`completed`), `from`/`to` (AAAA-MM-DD), `lineId`, `before` | `data` + `meta: { nextBefore, summary: { trips, planned, minutes, distance } }` |
| POST | `/me/trips` | `{ lineId, originStopId, destStopId }` | viagem realizada (1 trecho) |
| POST | `/me/trips/planned` | `{ legs: [{ lineId, originStopId, destStopId }] (1–3), walkMin }` | guarda uma opção do planejador |
| POST | `/me/trips/:id/complete` | — | planejada → realizada |
| DELETE | `/me/trips/:id` | — | apaga (204) |

## Notificações e alertas 🔒 (US17, US18, US20)
| Método | Rota | Corpo/parâmetros | Descrição |
|---|---|---|---|
| GET | `/me/notifications` | `unread`, `type`, `before`, `since`, `limit` | `{ items, unread }` |
| POST | `/me/notifications/read` | `{ ids? , all? }` | marca como lidas → `{ unread }` |
| DELETE | `/me/notifications/:id` · `/me/notifications` | — | apaga uma / limpa o histórico |
| GET/PATCH | `/me/notification-settings` | `{ delays?, serviceAlerts?, proximity? }` | preferências |
| PUT/DELETE | `/me/devices` | `{ token, platform }` / `{ token }` | aparelho para push (até 10 por conta) |
| GET | `/me/alerts` | — | alertas de proximidade com a próxima chegada |
| POST | `/me/alerts` | `{ lineId, stopId, minutesBefore (1–30), windowStart?, windowEnd? }` | cria (201) ou atualiza (200) |
| PATCH/DELETE | `/me/alerts/:id` | `{ minutesBefore?, active?, windowStart?, windowEnd? }` | edita / apaga |

## Comunidade (US21–US25)
| Método | Rota | Corpo/parâmetros | Descrição |
|---|---|---|---|
| GET | `/lines/:id/ratings` | `limit`, `before` | `{ summary: { average, count, distribution }, mine, items }` (público) |
| PUT | `/lines/:id/rating` 🔒 | `{ score (1–5), comment? (≤500) }` | avalia (uma por pessoa; de novo substitui) |
| DELETE | `/lines/:id/rating` 🔒 | — | apaga a minha |
| POST | `/reports` 🔒 | `{ lineId, stopId?, category, description? (≤1000) }` | 201 com `protocol` (US25); 409 repetida em 30 min; 429 acima de 10/h |
| GET | `/me/reports` 🔒 | — | minhas denúncias (com protocolo e status) |
| GET | `/lines/:id/reports` | `days` (1–90, padrão 7) | `{ total, summary[], items[] }` sem identificar autores |
| PUT/DELETE | `/reports/:id/support` 🔒 | — | "também passei por isso" |

Tipos de denúncia: `overcrowding`, `delay`, `vehicle`, `driver`, `cleanliness`, `safety`, `stop`, `other` (exige descrição).

## Compartilhamento (US29)
| Método | Rota | Corpo/parâmetros | Descrição |
|---|---|---|---|
| POST | `/me/shares` 🔒 | `{ lat, lng, lineId?, destStopId?, durationMin (5–240) }` | 201 com `url` (só nesta resposta); até 5 ativos |
| GET | `/me/shares` 🔒 | — | compartilhamentos ativos |
| PUT | `/me/shares/:id/position` 🔒 | `{ lat, lng }` | atualiza a posição (410 se terminou) |
| DELETE | `/me/shares/:id` 🔒 | — | encerra e apaga a posição |
| GET | `/api/v1/shares/:token` | — | visão pública `{ name, active, position, expiresAt, route }` |
| GET | `/s/:token` | — | página HTML para o contato (sem scripts, `noindex`) |

Limite geral: 120 escritas por minuto por usuário (429).

## Somente desenvolvimento
| Rota | Descrição |
|---|---|
| `GET /dev/emails` | caixa de e-mails (página HTML) quando `SMTP_URL` está vazio |
| `GET /api/v1/dev/emails` | a mesma caixa em JSON (usada pelos testes E2E) |
| `GET/POST /dev/simular` | formulário para criar um aviso de atraso/desvio/suspensão e disparar as notificações |
| `POST /api/v1/dev/alerts` | o mesmo em JSON: `{ lineCode, kind, extraDelayMin?, startsInMin?, durationMin? }` |
| `POST /api/v1/dev/monitor/tick` | roda a verificação do monitor na hora |

Só existem fora de produção e só respondem ao próprio computador (sem proxy, Host `localhost` e sem pedidos de outro site).
