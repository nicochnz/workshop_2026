import { z } from "zod";

// Types, schémas et topics issus de docs/contrat.md (v1.2). Toute divergence = bug.
// Tous les schémas sont stricts : un champ inconnu ou hors plage fait échouer la validation.

/** Taille maximale d'un message MQTT (contrat §1). Au-delà, le message est ignoré. */
export const MQTT_MAX_BYTES = 512;

/** Taille maximale d'un corps HTTP (contrat §1). Au-delà, l'API répond 413. */
export const HTTP_MAX_BODY = "4kb";

export const DEVICE_RE = /^SX-\d{3}$/;
export const COMMAND_ID_RE = /^[a-z0-9-]{1,16}$/;

const deviceId = z.string().regex(DEVICE_RE);
/** Timestamp Unix en secondes, 0 si l'ESP n'est pas synchronisé (contrat §1). */
const unixSeconds = z.number().int().min(0);

// --- §3.1 telemetry ---------------------------------------------------------

export const telemetrySchema = z.strictObject({
  device: deviceId,
  ts: unixSeconds,
  seq: z.number().int().min(0),
  temp: z.number().min(-40).max(80).nullable(),
  hum: z.number().min(0).max(100).nullable(),
  gas: z.number().int().min(0).max(1023),
  dist: z.number().int().min(2).max(400).nullable(),
  presence: z.union([z.literal(0), z.literal(1)]),
});

export type Telemetry = z.infer<typeof telemetrySchema>;

// --- §3.2 alerts ------------------------------------------------------------

export const ALERT_SOURCES = ["ESP", "AI_VISION", "AI_PREDICT", "SYSTEM"] as const;
export const ALERT_TYPES = ["GAS", "TEMP", "MOTION", "INTRUDER", "ANOMALY", "OFFLINE"] as const;
export const ALERT_LEVELS = ["INFO", "WARNING", "CRITICAL"] as const;

export const alertSchema = z.strictObject({
  device: deviceId,
  ts: unixSeconds,
  source: z.enum(ALERT_SOURCES),
  type: z.enum(ALERT_TYPES),
  level: z.enum(ALERT_LEVELS),
  value: z.number().optional(),
  // Score IA : confiance YOLO ou score d'anomalie, toujours entre 0 et 1
  score: z.number().min(0).max(1).optional(),
  message: z.string().max(200).optional(),
});

export type Alert = z.infer<typeof alertSchema>;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

// --- §3.3 status ------------------------------------------------------------

// Les champs ip/rssi/uptime_s/fw sont absents quand l'état est `offline` (LWT du broker).
export const statusSchema = z.discriminatedUnion("state", [
  z.strictObject({
    device: deviceId,
    state: z.literal("online"),
    ip: z.ipv4(),
    rssi: z.number().int().min(-120).max(0),
    uptime_s: z.number().int().min(0),
    fw: z.string().min(1).max(32),
  }),
  z.strictObject({
    device: deviceId,
    state: z.literal("offline"),
  }),
]);

export type Status = z.infer<typeof statusSchema>;

// --- §3.4 cmd / §3.5 ack ----------------------------------------------------

export const COMMAND_ACTIONS = ["BUZZER", "LED_RED", "LED_GREEN", "SILENCE"] as const;

const commandFields = {
  action: z.enum(COMMAND_ACTIONS),
  state: z.enum(["ON", "OFF"]).optional(),
  duration_ms: z.number().int().min(0).max(10000).optional(),
};

const stateRequired = {
  message: "state est obligatoire sauf pour SILENCE",
  path: ["state"],
};

/** Corps de `POST /api/v1/commands` : §3.4 sans `id`, que l'API génère. */
export const commandRequestSchema = z
  .strictObject(commandFields)
  .refine((cmd) => cmd.action === "SILENCE" || cmd.state !== undefined, stateRequired);

export type CommandRequest = z.infer<typeof commandRequestSchema>;

/** Message publié sur le topic `cmd`. */
export const commandSchema = z
  .strictObject({ id: z.string().regex(COMMAND_ID_RE), ...commandFields })
  .refine((cmd) => cmd.action === "SILENCE" || cmd.state !== undefined, stateRequired);

export type Command = z.infer<typeof commandSchema>;

export const ackSchema = z.strictObject({
  id: z.string().regex(COMMAND_ID_RE),
  ok: z.boolean(),
  error: z.literal("UNKNOWN_ACTION").optional(),
});

export type Ack = z.infer<typeof ackSchema>;

// --- Enregistrements renvoyés par l'API -------------------------------------
// `received_at` est posé par l'API : c'est l'heure du serveur qui fait foi (contrat §1).

export type TelemetryRecord = Telemetry & { received_at: number };
export type AlertRecord = Alert & { id: number; received_at: number };
export type StatusRecord = Status & { received_at: number };

// --- Topics (contrat §2) ----------------------------------------------------

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

export type Topics = ReturnType<typeof topics>;

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);
