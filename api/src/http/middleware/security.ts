import type { RequestHandler } from "express";
import type { Config } from "../../config.js";

/** En-têtes défensifs de base. Le dashboard est servi par la même origine. */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  next();
};

/**
 * CORS de développement uniquement (`next dev` sur :3000 → API sur :8080).
 * En production le dashboard est servi par l'API : même origine, donc aucun CORS,
 * ce qui réduit la surface d'attaque (CLAUDE.md, décision d'architecture).
 */
export function devCors(config: Config): RequestHandler {
  if (config.NODE_ENV !== "development") {
    return (_req, _res, next) => next();
  }

  return (req, res, next) => {
    const origin = req.headers.origin;
    if (typeof origin === "string" && config.allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}
