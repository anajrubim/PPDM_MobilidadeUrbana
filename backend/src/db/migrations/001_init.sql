-- Esquema inicial — Mobilidade Urbana (Sprint 1)
-- Contas (US01–US04), rede de linhas e paradas (US05–US09), favoritos (US11) e viagens do dashboard (US12).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  -- US13: somente o hash bcrypt da senha é armazenado
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  -- incrementado na troca de senha: invalida tokens emitidos antes
  token_version  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

-- US03: o token do link vai por e-mail; no banco fica só o SHA-256 dele
CREATE TABLE password_resets (
  token_hash  TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
CREATE INDEX password_resets_user_idx ON password_resets (user_id);

CREATE TABLE stops (
  id          SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng         DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "mode" deixa espaço para outros modais (metrô, VLT) sem mudar o esquema (RNF10)
CREATE TABLE lines (
  id               SERIAL PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  origin           TEXT NOT NULL,
  destination      TEXT NOT NULL,
  mode             TEXT NOT NULL DEFAULT 'bus',
  service_type     TEXT NOT NULL DEFAULT 'normal'
                   CHECK (service_type IN ('normal', 'executivo', 'noturno', 'expresso')),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  color            TEXT NOT NULL DEFAULT '#1B4F72',
  headway_min      INTEGER NOT NULL DEFAULT 15 CHECK (headway_min > 0),
  first_departure  TEXT NOT NULL DEFAULT '05:00' CHECK (first_departure ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  last_departure   TEXT NOT NULL DEFAULT '23:00' CHECK (last_departure ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- trajeto desenhado no mapa (US07): lista de [lat, lng]
  shape            JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE line_stops (
  line_id     INTEGER NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  stop_id     INTEGER NOT NULL REFERENCES stops(id) ON DELETE RESTRICT,
  seq         INTEGER NOT NULL,
  -- minutos desde a partida do ponto inicial (base dos horários previstos, US09)
  offset_min  INTEGER NOT NULL CHECK (offset_min >= 0),
  PRIMARY KEY (line_id, seq)
);
CREATE INDEX line_stops_stop_idx ON line_stops (stop_id);

CREATE TABLE favorites (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line_id     INTEGER NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, line_id)
);
CREATE INDEX favorites_line_idx ON favorites (line_id);

-- US12: viagens registradas pelo usuário, resumidas no dashboard
CREATE TABLE trips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line_id         INTEGER REFERENCES lines(id) ON DELETE SET NULL,
  line_code       TEXT NOT NULL,
  origin_stop_id  INTEGER REFERENCES stops(id) ON DELETE SET NULL,
  dest_stop_id    INTEGER REFERENCES stops(id) ON DELETE SET NULL,
  origin_label    TEXT NOT NULL,
  dest_label      TEXT NOT NULL,
  duration_min    INTEGER NOT NULL CHECK (duration_min >= 0),
  distance_m      INTEGER NOT NULL CHECK (distance_m >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX trips_user_created_idx ON trips (user_id, created_at DESC);
