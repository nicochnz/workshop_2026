import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { fail } from "../responses.js";

/** Limitation par IP (contrat §4.5), avec le format d'erreur du contrat §4.1. */
export function createRateLimiter(requestsPerMinute: number): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: requestsPerMinute,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json(fail("RATE_LIMITED", "Trop de requêtes, réessayez dans une minute"));
    },
  });
}
