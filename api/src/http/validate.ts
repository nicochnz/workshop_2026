import type { z } from "zod";
import { ApiError } from "../errors.js";

/**
 * Valide une entrée externe avec un schéma du contrat. En cas d'échec, lève une
 * `VALIDATION_ERROR` (400) dont le message pointe le champ fautif, comme dans l'exemple
 * du contrat §4.1 (« temp must be a number »).
 */
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new ApiError("VALIDATION_ERROR", describeIssue(result.error));
}

function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "requête invalide";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}
