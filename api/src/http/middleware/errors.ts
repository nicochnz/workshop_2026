import type { ErrorRequestHandler, RequestHandler } from "express";
import { ApiError } from "../../errors.js";
import { logger } from "../../logger.js";
import { fail } from "../responses.js";

/** Toute route non déclarée : 404 au format du contrat, même sous `/api/v1`. */
export const notFound: RequestHandler = (_req, _res, next) => {
  next(new ApiError("NOT_FOUND", "Route inconnue"));
};

/**
 * Point de sortie unique des erreurs. Les erreurs attendues deviennent un code du
 * contrat §4.4 ; les autres sont journalisées côté serveur et renvoyées en
 * `INTERNAL_ERROR` sans détail, pour ne rien révéler de l'implémentation.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const apiError = toApiError(err);
  if (apiError.code === "INTERNAL_ERROR") logger.error("Erreur non gérée", err);
  res.status(apiError.status).json(fail(apiError.code, apiError.message));
};

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  // Erreurs levées par express.json() : corps trop gros ou JSON illisible.
  switch (bodyParserType(err)) {
    case "entity.too.large":
      return new ApiError("PAYLOAD_TOO_LARGE", "Corps de requête trop volumineux");
    case "entity.parse.failed":
      return new ApiError("VALIDATION_ERROR", "Corps JSON invalide");
    default:
      return new ApiError("INTERNAL_ERROR", "Erreur interne");
  }
}

function bodyParserType(err: unknown): string | null {
  if (typeof err !== "object" || err === null || !("type" in err)) return null;
  const { type } = err as { type: unknown };
  return typeof type === "string" ? type : null;
}
