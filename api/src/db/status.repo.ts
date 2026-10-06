import type { Status, StatusRecord } from "../contract.js";
import type { Db } from "./pool.js";

export interface StatusRepository {
  /** Un seul état courant par boîtier : le heartbeat écrase le précédent. */
  upsert(status: Status, receivedAt: number): Promise<void>;
  latest(): Promise<StatusRecord | null>;
}

interface Row {
  device: string;
  state: string;
  ip: string | null;
  rssi: number | null;
  uptime_s: number | null;
  fw: string | null;
  received_at: number;
}

const UPSERT = `
  INSERT INTO device_status (device, state, ip, rssi, uptime_s, fw, received_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (device) DO UPDATE SET
    state = EXCLUDED.state,
    ip = EXCLUDED.ip,
    rssi = EXCLUDED.rssi,
    uptime_s = EXCLUDED.uptime_s,
    fw = EXCLUDED.fw,
    received_at = EXCLUDED.received_at
`;

const SELECT_LATEST = `
  SELECT device, state, ip, rssi, uptime_s, fw, received_at
  FROM device_status
  ORDER BY received_at DESC
  LIMIT 1
`;

export function createStatusRepository(db: Db): StatusRepository {
  return {
    async upsert(status, receivedAt) {
      const online = status.state === "online" ? status : null;
      await db.query(UPSERT, [
        status.device,
        status.state,
        online?.ip ?? null,
        online?.rssi ?? null,
        online?.uptime_s ?? null,
        online?.fw ?? null,
        receivedAt,
      ]);
    },

    async latest() {
      const { rows } = await db.query<Row>(SELECT_LATEST);
      const row = rows[0];
      return row ? toRecord(row) : null;
    },
  };
}

// Une ligne `online` incomplète (champ perdu) est renvoyée comme `offline` :
// le dashboard reçoit toujours un message conforme au contrat §3.3.
function toRecord(row: Row): StatusRecord {
  if (
    row.state !== "online" ||
    row.ip === null ||
    row.rssi === null ||
    row.uptime_s === null ||
    row.fw === null
  ) {
    return { device: row.device, state: "offline", received_at: row.received_at };
  }
  return {
    device: row.device,
    state: "online",
    ip: row.ip,
    rssi: row.rssi,
    uptime_s: row.uptime_s,
    fw: row.fw,
    received_at: row.received_at,
  };
}
