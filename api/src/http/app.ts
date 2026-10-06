import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import type { Express } from "express";
import type { Config } from "../config.js";
import { HTTP_MAX_BODY } from "../contract.js";
import type { TelemetryRepository } from "../db/telemetry.repo.js";
import { logger } from "../logger.js";
import type { AlertService } from "../services/alerts.service.js";
import type { CommandService } from "../services/commands.service.js";
import type { StatusService } from "../services/status.service.js";
import { createAuth } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { createRateLimiter } from "./middleware/rate-limit.js";
import { devCors, securityHeaders } from "./middleware/security.js";
import { alertsRoutes } from "./routes/alerts.js";
import { commandsRoutes } from "./routes/commands.js";
import type { HealthChecks } from "./routes/health.js";
import { healthRoutes } from "./routes/health.js";
import { statusRoutes } from "./routes/status.js";
import { telemetryRoutes } from "./routes/telemetry.js";

export interface AppDeps {
  config: Config;
  telemetry: TelemetryRepository;
  alerts: AlertService;
  status: StatusService;
  commands: CommandService;
  health: HealthChecks;
}

/**
 * Assemble l'API REST du contrat §4. Les dépendances sont injectées, ce qui permet
 * de tester les routes sans broker ni base.
 */
export function createApp(deps: AppDeps): Express {
  const { config } = deps;
  const app = express();

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(devCors(config));

  const limiter = createRateLimiter(config.RATE_LIMIT_PER_MIN);
  const auth = createAuth({ ingest: config.INGEST_TOKEN, operator: config.OPERATOR_TOKEN });

  // Alias hors `/api/v1` pour le healthcheck du Dockerfile.
  app.use("/health", limiter, healthRoutes(deps.health));

  const api = express.Router();
  api.use(limiter);
  api.use(express.json({ limit: HTTP_MAX_BODY, strict: true }));

  api.use("/health", healthRoutes(deps.health));
  api.use("/status", statusRoutes(deps.status, auth));
  api.use("/telemetry", telemetryRoutes(deps.telemetry, auth));
  api.use("/alerts", alertsRoutes(deps.alerts, auth));
  api.use(
    "/commands",
    commandsRoutes(deps.commands, auth, createRateLimiter(config.CMD_RATE_LIMIT_PER_MIN)),
  );

  app.use("/api/v1", api);

  serveDashboard(app, config.DASHBOARD_DIR);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

/**
 * Dashboard Next.js exporté en statique (`output: 'export'`), servi sur `/` par l'API :
 * même origine que le REST et le WebSocket, donc pas de CORS en production.
 */
function serveDashboard(app: Express, dir: string): void {
  const root = path.resolve(dir);
  if (!existsSync(root)) {
    logger.warn(`Dashboard absent (${root}) : l'API ne sert que /api/v1`);
    return;
  }

  const index = path.join(root, "index.html");
  app.use(express.static(root, { index: "index.html" }));

  // Repli sur index.html pour les routes du dashboard, jamais pour l'API.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/") || !existsSync(index)) {
      next();
      return;
    }
    res.sendFile(index, (err) => {
      if (err) next();
    });
  });
}
