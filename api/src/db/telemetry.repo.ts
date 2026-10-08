import type { Telemetry, TelemetryRecord } from "../contract.js";
import type { Db } from "./pool.js";

export interface TelemetryRepository {
  insert(telemetry: Telemetry, receivedAt: number): Promise<void>;
  /** Les `limit` dernières mesures, de la plus ancienne à la plus récente (contrat §4.3). */
  latest(limit: number): Promise<TelemetryRecord[]>;
}

interface Row {
  device: string;
  ts: number;
  seq: number;
  temp: number | null;
  hum: number | null;
  gas: number;
  dist: number | null;
  presence: number;
  received_at: number;
}

const INSERT = `
  INSERT INTO telemetry (device, ts, seq, temp, hum, gas, dist, presence, received_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`;

// Sous-requête : on prend les N plus récentes, puis on les remet dans l'ordre chronologique
// pour que le dashboard puisse les tracer directement.
const SELECT_LATEST = `
  SELECT device, ts, seq, temp, hum, gas, dist, presence, received_at
  FROM (
    SELECT * FROM telemetry ORDER BY received_at DESC, id DESC LIMIT $1
  ) AS recent
  ORDER BY received_at ASC, id ASC
`;

export function createTelemetryRepository(db: Db): TelemetryRepository {
  return {
    async insert(telemetry, receivedAt) {
      await db.query(INSERT, [
        telemetry.device,
        telemetry.ts,
        telemetry.seq,
        telemetry.temp,
        telemetry.hum,
        telemetry.gas,
        telemetry.dist,
        telemetry.presence,
        receivedAt,
      ]);
    },

    async latest(limit) {
      const { rows } = await db.query<Row>(SELECT_LATEST, [limit]);
      return rows.map(toRecord);
    },
  };
}

function toRecord(row: Row): TelemetryRecord {
  return {
    device: row.device,
    ts: row.ts,
    seq: row.seq,
    temp: row.temp,
    hum: row.hum,
    gas: row.gas,
    dist: row.dist,
    presence: row.presence === 1 ? 1 : 0,
    received_at: row.received_at,
  };
}
