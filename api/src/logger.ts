// Journalisation minimale, horodatée. Ne jamais y passer de jeton ni de mot de passe :
// les logs du serveur sont lus en démo et peuvent être récupérés pendant le pentest.
const stamp = (): string => new Date().toISOString();

export const logger = {
  info: (message: string): void => console.log(`${stamp()} ℹ️  ${message}`),
  warn: (message: string): void => console.warn(`${stamp()} ⚠️  ${message}`),
  error: (message: string, cause?: unknown): void => {
    console.error(`${stamp()} ❌ ${message}${cause === undefined ? "" : ` — ${describe(cause)}`}`);
  },
};

/** Message lisible d'une erreur, sans pile d'appel ni objet brut. */
export function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  return "erreur inconnue";
}
