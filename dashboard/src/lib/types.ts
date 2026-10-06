// Types issus de docs/contrat.md (v1.2). Toute divergence avec le contrat est un bug.

/** Timestamp Unix en secondes, posé par l'API à la réception (heure de référence). */
type ReceivedAt = { received_at: number };

// §3.1
export interface Telemetry extends ReceivedAt {
  device: string;
  ts: number;
  seq: number;
  temp: number | null;
  hum: number | null;
  gas: number;
  dist: number | null;
  presence: 0 | 1;
}

// §3.2
export type AlertSource = "ESP" | "AI_VISION" | "AI_PREDICT" | "SYSTEM";
export type AlertType = "GAS" | "TEMP" | "MOTION" | "INTRUDER" | "ANOMALY" | "OFFLINE";
export type AlertLevel = "INFO" | "WARNING" | "CRITICAL";

export interface Alert extends ReceivedAt {
  id: number;
  device: string;
  ts: number;
  source: AlertSource;
  type: AlertType;
  level: AlertLevel;
  value?: number;
  score?: number;
  message?: string;
}

// §3.3
export type Status = ReceivedAt &
  (
    | { device: string; state: "online"; ip: string; rssi: number; uptime_s: number; fw: string }
    | { device: string; state: "offline" }
  );

// §3.4 (corps de POST /commands, l'id est généré par l'API)
export type CommandAction = "BUZZER" | "LED_RED" | "LED_GREEN" | "SILENCE";

export interface CommandInput {
  action: CommandAction;
  state?: "ON" | "OFF";
  duration_ms?: number;
}

// §3.5
export interface Ack {
  id: string;
  ok: boolean;
  error?: string;
}

// §4.1
export interface ApiEnvelope<T> {
  data: T;
  error: { code: string; message: string } | null;
}

// §5.2
export type LiveMessage =
  | { event: "ready" }
  | { event: "telemetry"; data: Telemetry }
  | { event: "alert"; data: Alert }
  | { event: "status"; data: Status }
  | { event: "ack"; data: Ack };
