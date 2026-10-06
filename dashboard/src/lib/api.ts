import { apiUrl } from "./config";
import type { Alert, ApiEnvelope, CommandInput, Status, Telemetry } from "./types";

/** Erreur d'appel API. `status` = 0 si l'API est injoignable. `code` = codes du contrat §4.4. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (init.body) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "API injoignable");
  }

  let body: ApiEnvelope<T>;
  try {
    body = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError(response.status, "INVALID_RESPONSE", "Réponse de l'API illisible");
  }

  if (!response.ok || body.error) {
    throw new ApiError(
      response.status,
      body.error?.code ?? `HTTP_${response.status}`,
      body.error?.message ?? response.statusText,
    );
  }
  return body.data;
}

export const fetchStatus = (token: string) => apiFetch<Status | null>("/status", token);

export const fetchTelemetry = (token: string, limit = 150) =>
  apiFetch<Telemetry[]>(`/telemetry?limit=${limit}`, token);

export const fetchAlerts = (token: string, limit = 50) => apiFetch<Alert[]>(`/alerts?limit=${limit}`, token);

export const sendCommand = (token: string, command: CommandInput) =>
  apiFetch<{ id: string }>("/commands", token, { method: "POST", body: JSON.stringify(command) });
