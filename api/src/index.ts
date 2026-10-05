import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { topics } from "./contract.js";
import { createAlertRepository } from "./db/alerts.repo.js";
import { migrate } from "./db/migrate.js";
import { createPool, pingDb } from "./db/pool.js";
import { createStatusRepository } from "./db/status.repo.js";
import { createTelemetryRepository } from "./db/telemetry.repo.js";
import { createApp } from "./http/app.js";
import { logger } from "./logger.js";
import { MqttBridge } from "./mqtt/bridge.js";
import { RealtimeHub } from "./realtime/hub.js";
import { AlertService } from "./services/alerts.service.js";
import { CommandService } from "./services/commands.service.js";
import { IngestService } from "./services/ingest.service.js";
import { StatusService } from "./services/status.service.js";
import { OfflineWatchdog } from "./services/watchdog.service.js";

// Câblage de l'API : config → base → temps réel → MQTT → HTTP.
// Une seule connexion MQTT et un seul pool PostgreSQL pour tout le process.
const config = loadConfig();
const topic = topics(config.GROUP_ID);

const db = createPool(config.DATABASE_URL);
await migrate(db);

const realtime = new RealtimeHub({
  operatorToken: config.OPERATOR_TOKEN,
  allowedOrigins: config.allowedOrigins,
});

const alertRepository = createAlertRepository(db);
const telemetryRepository = createTelemetryRepository(db);
const statusRepository = createStatusRepository(db);

const alerts = new AlertService(alertRepository, realtime);
const status = new StatusService(statusRepository, realtime, alerts);
const watchdog = new OfflineWatchdog(config.OFFLINE_TIMEOUT_S * 1000, {
  onAlive: () => status.noteAlive(),
  onOffline: (device, reason) => status.markOffline(device, reason),
});

const ingest = new IngestService({
  topics: topic,
  telemetry: telemetryRepository,
  alerts,
  status,
  realtime,
  watchdog,
});

const broker = new MqttBridge(
  {
    url: config.MQTT_URL,
    username: config.MQTT_USERNAME,
    password: config.MQTT_PASSWORD,
    clientId: config.MQTT_CLIENT_ID,
    caFile: config.MQTT_CA_FILE,
    topics: topic,
  },
  (incomingTopic, payload) => ingest.handle(incomingTopic, payload),
);

const app = createApp({
  config,
  telemetry: telemetryRepository,
  alerts,
  status,
  commands: new CommandService(broker),
  health: { db: () => pingDb(db), broker: () => broker.connected },
});

const server = createServer(app);
realtime.attach(server);
broker.start();

if (config.allowedOrigins.length === 0) {
  logger.warn("ALLOWED_ORIGINS est vide : toutes les connexions WebSocket seront refusées");
}

server.listen(config.PORT, () => {
  logger.info(`API Sentinel-X sur :${config.PORT} — topics sentinel/${config.GROUP_ID}/*`);
});

let stopping = false;

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info(`${signal} reçu, arrêt en cours`);

  watchdog.stop();
  server.close();
  await Promise.allSettled([realtime.close(), broker.stop(), db.end()]);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
