-- Sprint 2 — planejamento e histórico de viagens (US15, US19, US26), tempo real e alertas (US16–US18, US20),
-- avaliações (US21, US22), denúncias (US23–US25) e compartilhamento de localização/rota (US29).

-- ---------- Viagens: planejadas e realizadas, com baldeação (US15, US19) ----------
ALTER TABLE trips
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'completed' CHECK (kind IN ('planned', 'completed')),
  -- trechos de ônibus da viagem: [{lineId, lineCode, originStopId, destStopId, originLabel, destLabel, durationMin, distanceM}]
  ADD COLUMN legs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN transfers INTEGER NOT NULL DEFAULT 0 CHECK (transfers >= 0),
  ADD COLUMN walk_min INTEGER NOT NULL DEFAULT 0 CHECK (walk_min >= 0),
  ADD COLUMN completed_at TIMESTAMPTZ;

-- Viagens da Sprint 1 (um trecho só) ganham o trecho equivalente
UPDATE trips SET
  legs = jsonb_build_array(jsonb_build_object(
    'lineId', line_id, 'lineCode', line_code, 'originStopId', origin_stop_id, 'destStopId', dest_stop_id,
    'originLabel', origin_label, 'destLabel', dest_label, 'durationMin', duration_min, 'distanceM', distance_m)),
  completed_at = created_at
WHERE legs = '[]'::jsonb;

CREATE INDEX trips_user_kind_created_idx ON trips (user_id, kind, created_at DESC);

-- ---------- Preferências de notificação (US17) ----------
ALTER TABLE users
  ADD COLUMN notify_delays BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN notify_service_alerts BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN notify_proximity BOOLEAN NOT NULL DEFAULT true;

-- ---------- Avisos de serviço: atrasos e mudanças de itinerário (US17) ----------
-- Na Sprint 3 o painel do administrador cadastra; agora vêm do seed e da ferramenta de desenvolvimento.
CREATE TABLE service_alerts (
  id          SERIAL PRIMARY KEY,
  line_id     INTEGER NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('delay', 'detour', 'suspension')),
  title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  message     TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 600),
  -- minutos somados à previsão dos ônibus da linha enquanto o aviso vale (atraso)
  extra_delay_min INTEGER NOT NULL DEFAULT 0 CHECK (extra_delay_min BETWEEN 0 AND 120),
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX service_alerts_line_period_idx ON service_alerts (line_id, ends_at);

-- ---------- Notificações recebidas (US17, US18, US20, US25) ----------
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('delay', 'service_alert', 'proximity', 'report', 'share', 'system')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  line_id     INTEGER REFERENCES lines(id) ON DELETE SET NULL,
  stop_id     INTEGER REFERENCES stops(id) ON DELETE SET NULL,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- evita a mesma notificação duas vezes (ex.: o mesmo atraso a cada verificação)
  dedupe_key  TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX notifications_dedupe_idx ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);

-- Aparelhos que recebem push (token do Expo/FCM). O envio só acontece com PUSH_PROVIDER configurado.
CREATE TABLE push_devices (
  token       TEXT PRIMARY KEY CHECK (length(token) BETWEEN 10 AND 300),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX push_devices_user_idx ON push_devices (user_id);

-- ---------- Alertas de proximidade: ônibus chegando ao ponto (US18) ----------
CREATE TABLE proximity_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line_id         INTEGER NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  stop_id         INTEGER NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  minutes_before  INTEGER NOT NULL CHECK (minutes_before BETWEEN 1 AND 30),
  -- janela opcional (ex.: só das 07:00 às 09:00); vazia = o dia todo
  window_start    TEXT CHECK (window_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  window_end      TEXT CHECK (window_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, line_id, stop_id)
);
CREATE INDEX proximity_alerts_active_idx ON proximity_alerts (active) WHERE active;

-- ---------- Avaliações de linha (US21, US22) ----------
CREATE TABLE line_ratings (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line_id     INTEGER NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  score       SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment     TEXT CHECK (length(comment) <= 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, line_id)
);
CREATE INDEX line_ratings_line_updated_idx ON line_ratings (line_id, updated_at DESC);

-- ---------- Denúncias (US23–US25) ----------
CREATE SEQUENCE report_protocol_seq;
CREATE TABLE reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- número de protocolo mostrado ao usuário na confirmação (US25)
  protocol     TEXT NOT NULL UNIQUE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line_id      INTEGER NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  stop_id      INTEGER REFERENCES stops(id) ON DELETE SET NULL,
  category     TEXT NOT NULL CHECK (category IN ('overcrowding', 'delay', 'vehicle', 'driver', 'cleanliness', 'safety', 'stop', 'other')),
  description  TEXT CHECK (length(description) <= 1000),
  status       TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'in_review', 'resolved', 'dismissed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reports_line_created_idx ON reports (line_id, created_at DESC);
CREATE INDEX reports_user_created_idx ON reports (user_id, created_at DESC);

-- "Também passei por isso": outros usuários confirmam a denúncia (US24)
CREATE TABLE report_supports (
  report_id   UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, user_id)
);

-- ---------- Compartilhamento de localização/rota (US29) ----------
CREATE TABLE location_shares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- o link leva um token aleatório; no banco fica só o SHA-256 dele
  token_hash    TEXT NOT NULL UNIQUE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line_id       INTEGER REFERENCES lines(id) ON DELETE SET NULL,
  dest_stop_id  INTEGER REFERENCES stops(id) ON DELETE SET NULL,
  -- posição apagada (NULL) quando o compartilhamento termina: localização é dado pessoal (LGPD)
  lat           DOUBLE PRECISION CHECK (lat BETWEEN -90 AND 90),
  lng           DOUBLE PRECISION CHECK (lng BETWEEN -180 AND 180),
  position_at   TIMESTAMPTZ NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  stopped_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX location_shares_user_idx ON location_shares (user_id, created_at DESC);
CREATE INDEX location_shares_expires_idx ON location_shares (expires_at);
