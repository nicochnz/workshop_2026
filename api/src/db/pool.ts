import pg from "pg";
import { logger } from "../logger.js";

// pg renvoie les BIGINT en chaîne par défaut (précision 64 bits). Nos valeurs
// (timestamps en secondes, compteurs) tiennent dans un number : on les convertit.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

export type Db = pg.Pool;

export function createPool(databaseUrl: string): Db {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30_000,
  });

  // Un client inactif qui tombe ne doit pas faire planter le process.
  pool.on("error", (err) => logger.error("PostgreSQL (client inactif)", err));

  return pool;
}

/** Vérifie que la base répond (utilisé par `GET /health`). */
export async function pingDb(db: Db): Promise<boolean> {
  try {
    await db.query("SELECT 1");
    return true;
  } catch (err) {
    logger.error("PostgreSQL injoignable", err);
    return false;
  }
}
