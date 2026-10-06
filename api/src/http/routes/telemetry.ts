import { Router } from "express";
import { z } from "zod";
import type { TelemetryRepository } from "../../db/telemetry.repo.js";
import type { RequireRole } from "../middleware/auth.js";
import { ok } from "../responses.js";
import { parse } from "../validate.js";

// `limit` 1 → 1000, défaut 100 (contrat §4.3). Tout autre paramètre est refusé.
const querySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

/** `GET /api/v1/telemetry` — mesures de la plus ancienne à la plus récente. */
export function telemetryRoutes(repository: TelemetryRepository, auth: RequireRole): Router {
  const router = Router();

  router.get("/", auth("operator"), async (req, res) => {
    const { limit } = parse(querySchema, req.query);
    res.json(ok(await repository.latest(limit)));
  });

  return router;
}
