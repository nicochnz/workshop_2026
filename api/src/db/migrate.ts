import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { logger } from "../logger.js";
import type { Db } from "./pool.js";

// db/schema.sql est à la racine du paquet : le chemin est le même depuis src/ et dist/.
const SCHEMA_URL = new URL("../../db/schema.sql", import.meta.url);

const MAX_ATTEMPTS = 10;
const RETRY_DELAY_MS = 1000;

/**
 * Applique le schéma (idempotent). PostgreSQL démarre parfois après l'API dans
 * docker-compose : on réessaie quelques secondes avant d'abandonner.
 */
export async function migrate(db: Db): Promise<void> {
  const schema = await readFile(SCHEMA_URL, "utf8");

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await db.query(schema);
      logger.info("Schéma PostgreSQL à jour");
      return;
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) throw err;
      logger.warn(`PostgreSQL pas encore prêt (essai ${attempt}/${MAX_ATTEMPTS})`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}
