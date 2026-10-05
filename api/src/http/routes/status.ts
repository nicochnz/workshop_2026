import { Router } from "express";
import type { StatusService } from "../../services/status.service.js";
import type { RequireRole } from "../middleware/auth.js";
import { ok } from "../responses.js";

/** `GET /api/v1/status` — dernier heartbeat connu, ou `null` si aucun (contrat §4.3). */
export function statusRoutes(status: StatusService, auth: RequireRole): Router {
  const router = Router();

  router.get("/", auth("operator"), async (_req, res) => {
    res.json(ok(await status.current()));
  });

  return router;
}
