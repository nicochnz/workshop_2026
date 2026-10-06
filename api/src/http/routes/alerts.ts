import { Router } from "express";
import { z } from "zod";
import { ALERT_LEVELS, alertSchema } from "../../contract.js";
import type { AlertService } from "../../services/alerts.service.js";
import type { RequireRole } from "../middleware/auth.js";
import { ok } from "../responses.js";
import { parse } from "../validate.js";

// `limit` 1 → 200, défaut 50 ; `level` optionnel (contrat §4.3).
const querySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  level: z.enum(ALERT_LEVELS).optional(),
});

/**
 * `GET /api/v1/alerts` — historique, plus récentes d'abord.
 * `POST /api/v1/alerts` — création, utilisée par le script IA (`AI_VISION` pour une
 * personne détectée avec son `score` de confiance, `AI_PREDICT` pour une anomalie de
 * série temporelle). L'API ne fait aucune inférence : elle valide, stocke et diffuse.
 */
export function alertsRoutes(alerts: AlertService, auth: RequireRole): Router {
  const router = Router();

  router.get("/", auth("operator"), async (req, res) => {
    const query = parse(querySchema, req.query);
    res.json(ok(await alerts.list(query)));
  });

  router.post("/", auth("ingest", "operator"), async (req, res) => {
    const alert = parse(alertSchema, req.body);
    const record = await alerts.record(alert);
    res.status(201).json(ok({ id: record.id, received_at: record.received_at }));
  });

  return router;
}
