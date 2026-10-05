import { createHash, timingSafeEqual } from "node:crypto";

// Comparaison en temps constant (contrat §4.2) : on compare les empreintes SHA-256
// plutôt que les chaînes, ce qui donne deux tampons de même longueur et ne laisse
// donc pas fuiter la longueur du jeton attendu.
const digest = (value: string): Buffer => createHash("sha256").update(value, "utf8").digest();

export function tokensMatch(candidate: string, expected: string): boolean {
  return timingSafeEqual(digest(candidate), digest(expected));
}

/** Extrait le jeton d'un en-tête `Authorization: Bearer <token>`. */
export function readBearer(header: string | undefined): string | null {
  if (typeof header !== "string") return null;
  const match = /^Bearer (\S{1,512})$/.exec(header);
  return match?.[1] ?? null;
}
