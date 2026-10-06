// Codes d'erreur et codes HTTP du contrat §4.4. Toute erreur renvoyée au client
// passe par ApiError : aucun détail interne n'est exposé.
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  BROKER_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }
}
