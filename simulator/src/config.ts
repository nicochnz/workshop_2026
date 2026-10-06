import { z } from "zod";

// Toute la config vient des variables d'environnement (.env), validée au démarrage.
const envSchema = z.object({
  MQTT_URL: z.url().default("mqtt://localhost:1883"),
  MQTT_USERNAME: z.string().min(1).default("esp"),
  MQTT_PASSWORD: z.string().min(1),
  MQTT_CLIENT_ID: z.string().min(1).default("sx-003-sim"),
  // CA locale pour mqtts:// (docs/tls.md), ignorée en mqtt://
  MQTT_CA_FILE: z.string().default(""),
  GROUP_ID: z.string().regex(/^g\d+$/).default("g3"),
  DEVICE_ID: z.string().regex(/^SX-\d{3}$/).default("SX-003"),
  TELEMETRY_INTERVAL_MS: z.coerce.number().int().min(500).default(2000),
  STATUS_INTERVAL_MS: z.coerce.number().int().min(1000).default(10000),
  GAS_WARN: z.coerce.number().int().min(0).max(1023).default(400),
  GAS_CRIT: z.coerce.number().int().min(0).max(1023).default(700),
  PRESENCE_CM: z.coerce.number().int().min(2).max(400).default(80),
  ALERT_COOLDOWN_S: z.coerce.number().int().min(0).default(30),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Configuration invalide (.env) :");
    for (const issue of result.error.issues) {
      console.error(`   - ${issue.path.join(".")} : ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}
