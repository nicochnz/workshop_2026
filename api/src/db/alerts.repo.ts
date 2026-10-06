import type { Alert, AlertLevel, AlertRecord } from "../contract.js";
import { ALERT_LEVELS, ALERT_SOURCES, ALERT_TYPES } from "../contract.js";
import type { Db } from "./pool.js";

export interface AlertQuery {
  limit: number;
  level?: AlertLevel;
}

export interface AlertRepository {
  insert(alert: Alert, receivedAt: number): Promise<AlertRecord>;
  /** Historique, plus récentes d'abord (contrat §4.3). */
  list(query: AlertQuery): Promise<AlertRecord[]>;
}

interface Row {
  id: number;
  device: string;
  ts: number;
  source: string;
  type: string;
  level: string;
  value: number | null;
  score: number | null;
  message: string | null;
  received_at: number;
}

const INSERT = `
  INSERT INTO alerts (device, ts, source, type, level, value, score, message, received_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  RETURNING id
`;

const COLUMNS = "id, device, ts, source, type, level, value, score, message, received_at";

export function createAlertRepository(db: Db): AlertRepository {
  return {
    async insert(alert, receivedAt) {
      const { rows } = await db.query<{ id: number }>(INSERT, [
        alert.device,
        alert.ts,
        alert.source,
        alert.type,
        alert.level,
        alert.value ?? null,
        alert.score ?? null,
        alert.message ?? null,
        receivedAt,
      ]);
      const id = rows[0]?.id;
      if (id === undefined) throw new Error("INSERT alerts n'a pas renvoyé d'id");
      return { ...alert, id, received_at: receivedAt };
    },

    async list({ limit, level }) {
      // Deux requêtes paramétrées distinctes plutôt qu'un WHERE construit par concaténation.
      const { rows } = level
        ? await db.query<Row>(
            `SELECT ${COLUMNS} FROM alerts WHERE level = $1 ORDER BY received_at DESC, id DESC LIMIT $2`,
            [level, limit],
          )
        : await db.query<Row>(
            `SELECT ${COLUMNS} FROM alerts ORDER BY received_at DESC, id DESC LIMIT $1`,
            [limit],
          );
      return rows.map(toRecord);
    },
  };
}

// Les enums viennent de colonnes TEXT : on retombe sur une valeur du contrat si la
// base contenait autre chose (migration manuelle, insertion hors API).
function toRecord(row: Row): AlertRecord {
  const record: AlertRecord = {
    id: row.id,
    device: row.device,
    ts: row.ts,
    source: oneOf(ALERT_SOURCES, row.source, "SYSTEM"),
    type: oneOf(ALERT_TYPES, row.type, "ANOMALY"),
    level: oneOf(ALERT_LEVELS, row.level, "INFO"),
    received_at: row.received_at,
  };
  // Champs optionnels (contrat §3.2) : absents plutôt que `null` dans la réponse.
  if (row.value !== null) record.value = row.value;
  if (row.score !== null) record.score = row.score;
  if (row.message !== null) record.message = row.message;
  return record;
}

function oneOf<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
