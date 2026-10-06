-- Schéma Sentinel-X — aligné sur docs/contrat.md §3.
-- Appliqué automatiquement au démarrage de l'API (idempotent, voir src/db/migrate.ts).

-- §3.1 telemetry : une ligne par message reçu. `received_at` = heure du serveur (contrat §1).
CREATE TABLE IF NOT EXISTS telemetry (
  id          BIGSERIAL PRIMARY KEY,
  device      TEXT             NOT NULL,
  ts          BIGINT           NOT NULL,
  seq         BIGINT           NOT NULL,
  temp        DOUBLE PRECISION,
  hum         DOUBLE PRECISION,
  gas         INTEGER          NOT NULL,
  dist        INTEGER,
  presence    SMALLINT         NOT NULL,
  received_at BIGINT           NOT NULL
);

CREATE INDEX IF NOT EXISTS telemetry_received_at_idx ON telemetry (received_at DESC, id DESC);

-- §3.2 alerts : ESP (MQTT), IA (POST /alerts) et SYSTEM (watchdog offline de l'API).
CREATE TABLE IF NOT EXISTS alerts (
  id          BIGSERIAL PRIMARY KEY,
  device      TEXT             NOT NULL,
  ts          BIGINT           NOT NULL,
  source      TEXT             NOT NULL,
  type        TEXT             NOT NULL,
  level       TEXT             NOT NULL,
  value       DOUBLE PRECISION,
  score       DOUBLE PRECISION,
  message     TEXT,
  received_at BIGINT           NOT NULL
);

CREATE INDEX IF NOT EXISTS alerts_received_at_idx ON alerts (received_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS alerts_level_idx ON alerts (level, received_at DESC, id DESC);

-- §3.3 status : dernier heartbeat connu par boîtier (une seule ligne pour SX-003).
CREATE TABLE IF NOT EXISTS device_status (
  device      TEXT PRIMARY KEY,
  state       TEXT   NOT NULL,
  ip          TEXT,
  rssi        INTEGER,
  uptime_s    BIGINT,
  fw          TEXT,
  received_at BIGINT NOT NULL
);
