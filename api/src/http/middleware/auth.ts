import type { RequestHandler } from "express";
import { ApiError } from "../../errors.js";
import { readBearer, tokensMatch } from "../../security/tokens.js";

// Authentification par jeton Bearer (contrat §4.2). Deux rôles, deux jetons distincts.
export type Role = "ingest" | "operator";

export type RequireRole = (...allowed: Role[]) => RequestHandler;

export interface Tokens {
  ingest: string;
  operator: string;
}

export function createAuth(tokens: Tokens): RequireRole {
  return (...allowed: Role[]): RequestHandler =>
    (req, _res, next) => {
      const token = readBearer(req.headers.authorization);
      if (token === null) {
        next(new ApiError("UNAUTHORIZED", "Jeton Bearer absent"));
        return;
      }

      const role = resolveRole(token, tokens);
      if (role === null) {
        next(new ApiError("UNAUTHORIZED", "Jeton invalide"));
        return;
      }
      if (!allowed.includes(role)) {
        next(new ApiError("FORBIDDEN", "Ce jeton n'autorise pas cette route"));
        return;
      }
      next();
    };
}

// Les deux comparaisons sont toujours effectuées, sans sortie anticipée :
// le temps de réponse ne révèle pas quel jeton a été tenté.
function resolveRole(token: string, tokens: Tokens): Role | null {
  const isIngest = tokensMatch(token, tokens.ingest);
  const isOperator = tokensMatch(token, tokens.operator);
  if (isOperator) return "operator";
  if (isIngest) return "ingest";
  return null;
}
