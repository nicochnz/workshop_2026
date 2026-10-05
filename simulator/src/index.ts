import mqtt from "mqtt";
import { Actuators } from "./actuators.js";
import { AlertEngine } from "./alerts.js";
import { loadConfig } from "./config.js";
import type { Status, Telemetry } from "./contract.js";
import { nowSeconds, topics } from "./contract.js";
import { HELP, listenKeyboard } from "./keyboard.js";
import { SensorModel } from "./sensors.js";

const FW_VERSION = "1.0.0-sim";
const SIM_IP = "127.0.0.1";

const config = loadConfig();
const topic = topics(config.GROUP_ID);
const startedAt = Date.now();

const sensors = new SensorModel();
const actuators = new Actuators();
const alertEngine = new AlertEngine(config.DEVICE_ID, {
  gasWarn: config.GAS_WARN,
  gasCrit: config.GAS_CRIT,
  cooldownS: config.ALERT_COOLDOWN_S,
});

let seq = 0;

const offlineStatus: Status = { device: config.DEVICE_ID, state: "offline" };

// LWT : publié par le broker si on disparaît sans se déconnecter proprement
const client = mqtt.connect(config.MQTT_URL, {
  clientId: config.MQTT_CLIENT_ID,
  username: config.MQTT_USERNAME,
  password: config.MQTT_PASSWORD,
  reconnectPeriod: 2000,
  queueQoSZero: false, // pas de télémétrie périmée envoyée en rafale après une coupure
  will: { topic: topic.status, payload: Buffer.from(JSON.stringify(offlineStatus)), qos: 1, retain: true },
});

function publish(t: string, message: object, qos: 0 | 1, retain = false): void {
  client.publish(t, JSON.stringify(message), { qos, retain });
}

function publishTelemetry(): void {
  if (!client.connected) return;

  const reading = sensors.read();
  const telemetry: Telemetry = {
    device: config.DEVICE_ID,
    ts: nowSeconds(),
    seq: seq++,
    ...reading,
    presence: reading.dist !== null && reading.dist < config.PRESENCE_CM ? 1 : 0,
  };
  publish(topic.telemetry, telemetry, 0);
  console.log(
    `📡 #${telemetry.seq} [${sensors.scenario}] temp=${telemetry.temp} hum=${telemetry.hum} ` +
      `gas=${telemetry.gas} dist=${telemetry.dist} presence=${telemetry.presence}`,
  );

  for (const alert of alertEngine.evaluate(telemetry)) {
    publish(topic.alerts, alert, 1);
    console.log(`🚨 ${alert.level} ${alert.type} : ${alert.message}`);
    if (alert.type === "GAS" && alert.level === "CRITICAL") actuators.gasCritical();
  }
}

function publishStatus(): void {
  if (!client.connected) return;
  const status: Status = {
    device: config.DEVICE_ID,
    state: "online",
    ip: SIM_IP,
    rssi: -50 - Math.round(Math.random() * 15),
    uptime_s: Math.floor((Date.now() - startedAt) / 1000),
    fw: FW_VERSION,
  };
  publish(topic.status, status, 1, true);
}

// Message volontairement hors contrat : l'API doit le rejeter
function publishInvalid(): void {
  const invalid = { device: config.DEVICE_ID, ts: -1, seq: "abc", temp: "hot", gas: 5000, presence: 2, evil: "<script>" };
  publish(topic.telemetry, invalid, 0);
  console.log("💣 Message invalide envoyé sur telemetry");
}

function shutdown(): void {
  console.log("\n👋 Arrêt propre : publication de l'état offline");
  publish(topic.status, offlineStatus, 1, true);
  client.end(false, {}, () => process.exit(0));
}

client.on("connect", () => {
  console.log(`✅ Connecté à ${config.MQTT_URL} (client ${config.MQTT_CLIENT_ID})`);
  client.subscribe(topic.cmd, { qos: 1 });
  publishStatus();
});

client.on("message", (t, payload) => {
  if (t !== topic.cmd) return;
  const ack = actuators.handle(payload);
  if (ack) publish(topic.ack, ack, 1);
});

client.on("reconnect", () => console.log("🔄 Reconnexion au broker..."));
client.on("error", (err) => console.error(`❌ MQTT : ${err.message}`));

setInterval(publishTelemetry, config.TELEMETRY_INTERVAL_MS);
setInterval(publishStatus, config.STATUS_INTERVAL_MS);

console.log(`🛰️  Simulateur ${config.DEVICE_ID} → topics sentinel/${config.GROUP_ID}/*`);
console.log(HELP);

listenKeyboard({
  setScenario: (s) => {
    sensors.setScenario(s);
    console.log(`🎬 Scénario : ${s}`);
  },
  sendInvalid: publishInvalid,
  crash: () => {
    console.log("💥 Crash simulé : coupure sans déconnexion, le broker va publier le LWT");
    process.exit(1);
  },
  quit: shutdown,
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
