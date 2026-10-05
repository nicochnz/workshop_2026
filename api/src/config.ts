import { z } from "zod";

// Toute la configuration vient des variables d'environnement (contrat §8), validée au démarrage.
// Aucune valeur par défaut pour les secrets : l'API refuse de démarrer s'ils manquent.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  GROUP_ID: z.string().regex(/^g\d+$/).default("g3"),

  MQTT_URL: z.url().default("mqtt://localhost:1883"),
  MQTT_USERNAME: z.string().min(1).default("api"),
  MQTT_PASSWORD: z.string().min(1),
  MQTT_CLIENT_ID: z.string().min(1).default("api-g3"),
  // Chemin du CA pour MQTTS (étape 5). Vide tant que le broker est en clair.
  MQTT_CA_FILE: z.string().default(""),

  DATABASE_URL: z.string().min(1),

  // Jetons Bearer (contrat §4.2) : 32 caractères minimum, générés aléatoirement.
  INGEST_TOKEN: z.string().min(32),
  OPERATOR_TOKEN: z.string().min(32),

  ALLOWED_ORIGINS: z.string().default(""),
  OFFLINE_TIMEOUT_S: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(120),
  CMD_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(20),

  /** Dossier du dashboard exporté (`dashboard/out`), servi en statique sur `/`. */
  DASHBOARD_DIR: z.string().default("public"),
});

export type Config = z.infer<typeof envSchema> & {
  /** `ALLOWED_ORIGINS` découpé : origines autorisées pour le WebSocket et le CORS de dev. */
  allowedOrigins: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    console.error("❌ Configuration invalide (.env) :");
    for (const issue of result.error.issues) {
      console.error(`   - ${issue.path.join(".")} : ${issue.message}`);
    }
    process.exit(1);
  }
  return withDerived(result.data);
}

function withDerived(config: z.infer<typeof envSchema>): Config {
  return {
    ...config,
    allowedOrigins: config.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  };
}
