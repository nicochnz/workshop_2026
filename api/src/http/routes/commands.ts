import type { RequestHandler } from "express";
import { Router } from "express";
import { commandRequestSchema } from "../../contract.js";
import type { CommandService } from "../../services/commands.service.js";
import type { RequireRole } from "../middleware/auth.js";
import { ok } from "../responses.js";
import { parse } from "../validate.js";

/**
 * `POST /api/v1/commands` — dashboard → MQTT `cmd` → boîtier (contrat §3.4).
 * Réponse `202` : la commande est publiée, son exécution est confirmée plus tard par
 * l'`ack` poussé en WebSocket. Seules les quatre actions du contrat sont acceptées.
 */
export function commandsRoutes(
  commands: CommandService,
  auth: RequireRole,
  limiter: RequestHandler,
): Router {
  const router = Router();

  router.post("/", limiter, auth("operator"), async (req, res) => {
    const request = parse(commandRequestSchema, req.body);
    res.status(202).json(ok(await commands.send(request)));
  });

  return router;
}
