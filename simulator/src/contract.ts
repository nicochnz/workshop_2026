import { z } from "zod";

// Types et formats issus de docs/contrat.md (v1.2). Toute divergence = bug.

export interface Telemetry {
  device: string;
  ts: number;
  seq: number;
  temp: number | null;
  hum: number | null;
  gas: number;
  dist: number | null;
  presence: 0 | 1;
}

export type AlertSource = "ESP" | "AI_VISION" | "AI_PREDICT" | "SYSTEM";
export type AlertType = "GAS" | "TEMP" | "MOTION" | "INTRUDER" | "ANOMALY" | "OFFLINE";
export type AlertLevel = "INFO" | "WARNING" | "CRITICAL";

export interface Alert {
  device: string;
  ts: number;
  source: AlertSource;
  type: AlertType;
  level: AlertLevel;
  value?: number;
  score?: number;
  message?: string;
}

export type Status =
  | { device: string; state: "online"; ip: string; rssi: number; uptime_s: number; fw: string }
  | { device: string; state: "offline" };

export interface Ack {
  id: string;
  ok: boolean;
  error?: "UNKNOWN_ACTION";
}

// §3.4 — validation stricte : champ inconnu ou valeur hors plage = commande rejetée.
export const commandSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9-]{1,16}$/),
    action: z.enum(["BUZZER", "LED_RED", "LED_GREEN", "SILENCE"]),
    state: z.enum(["ON", "OFF"]).optional(),
    duration_ms: z.number().int().min(0).max(10000).optional(),
  })
  .refine((cmd) => cmd.action === "SILENCE" || cmd.state !== undefined, {
    message: "state est obligatoire sauf pour SILENCE",
  });

export type Command = z.infer<typeof commandSchema>;

export function topics(groupId: string) {
  const base = `sentinel/${groupId}`;
  return {
    telemetry: `${base}/telemetry`,
    alerts: `${base}/alerts`,
    status: `${base}/status`,
    cmd: `${base}/cmd`,
    ack: `${base}/ack`,
  };
}

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);
