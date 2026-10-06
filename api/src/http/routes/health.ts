import { Router } from "express";

export interface HealthChecks {
  db(): Promise<boolean>;
  broker(): boolean;
}

/** Durée de mise en cache de la sonde base, pour éviter un SELECT par appel. */
const PROBE_TTL_MS = 2000;

/**
 * `GET /health` — non authentifié (contrat §4.2), utilisé par le healthcheck Docker.
 * Réponse exacte du contrat §4.3 quand tout va bien : `{"status":"ok"}`.
 * Seule la base conditionne le code HTTP : un broker momentanément absent est signalé
 * dans le corps mais ne doit pas faire redémarrer le conteneur en pleine démo.
 */
export function healthRoutes(health: HealthChecks): Router {
  const router = Router();
  let cached: { at: number; db: boolean } | null = null;

  const probeDb = async (): Promise<boolean> => {
    if (cached && Date.now() - cached.at < PROBE_TTL_MS) return cached.db;
    const db = await health.db();
    cached = { at: Date.now(), db };
    return db;
  };

  router.get("/", async (_req, res) => {
    const db = await probeDb();
    const mqtt = health.broker();

    if (!db) {
      res.status(503).json({ status: "degraded", db, mqtt });
      return;
    }
    res.json(mqtt ? { status: "ok" } : { status: "ok", mqtt });
  });

  return router;
}
