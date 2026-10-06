import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import type { Config } from "../src/config.js";
import type { Alert, AlertRecord, Command, Status, StatusRecord, Telemetry, TelemetryRecord } from "../src/contract.js";
import type { AlertQuery, AlertRepository } from "../src/db/alerts.repo.js";
import { ApiError } from "../src/errors.js";
import type { StatusRepository } from "../src/db/status.repo.js";
import type { TelemetryRepository } from "../src/db/telemetry.repo.js";
import type { AppDeps } from "../src/http/app.js";
import { createApp } from "../src/http/app.js";
import type { MqttBroker } from "../src/mqtt/bridge.js";
import type { Broadcaster, RealtimeEvent } from "../src/realtime/hub.js";
import { AlertService } from "../src/services/alerts.service.js";
import { CommandService } from "../src/services/commands.service.js";
import { StatusService } from "../src/services/status.service.js";

// Doublures en mémoire : les tests valident le comportement de l'API sans PostgreSQL
// ni broker, et restent donc exécutables partout (CI, poste d'un coéquipier).

export const OPERATOR_TOKEN = "operator-token-0000000000000000000000";
export const INGEST_TOKEN = "ingest-token-11111111111111111111111111";

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    NODE_ENV: "test",
    PORT: 0,
    GROUP_ID: "g3",
    MQTT_URL: "mqtt://localhost:1883",
    MQTT_USERNAME: "api",
    MQTT_PASSWORD: "change-me-api",
    MQTT_CLIENT_ID: "api-g3-test",
    MQTT_CA_FILE: "",
    DATABASE_URL: "postgres://test@localhost:5432/test",
    INGEST_TOKEN,
    OPERATOR_TOKEN,
    ALLOWED_ORIGINS: "http://localhost:3000",
    allowedOrigins: ["http://localhost:3000"],
    OFFLINE_TIMEOUT_S: 10,
    RATE_LIMIT_PER_MIN: 1000,
    CMD_RATE_LIMIT_PER_MIN: 1000,
    DASHBOARD_DIR: "no-dashboard-in-tests",
    ...overrides,
  };
}

export class FakeTelemetryRepository implements TelemetryRepository {
  readonly rows: TelemetryRecord[] = [];

  insert(telemetry: Telemetry, receivedAt: number): Promise<void> {
    this.rows.push({ ...telemetry, received_at: receivedAt });
    return Promise.resolve();
  }

  latest(limit: number): Promise<TelemetryRecord[]> {
    return Promise.resolve(this.rows.slice(-limit));
  }
}

export class FakeAlertRepository implements AlertRepository {
  readonly rows: AlertRecord[] = [];
  lastQuery: AlertQuery | null = null;

  insert(alert: Alert, receivedAt: number): Promise<AlertRecord> {
    const record: AlertRecord = { ...alert, id: this.rows.length + 1, received_at: receivedAt };
    this.rows.push(record);
    return Promise.resolve(record);
  }

  list(query: AlertQuery): Promise<AlertRecord[]> {
    this.lastQuery = query;
    const matching = query.level ? this.rows.filter((row) => row.level === query.level) : this.rows;
    return Promise.resolve([...matching].reverse().slice(0, query.limit));
  }
}

export class FakeStatusRepository implements StatusRepository {
  current: StatusRecord | null = null;

  upsert(status: Status, receivedAt: number): Promise<void> {
    this.current = { ...status, received_at: receivedAt };
    return Promise.resolve();
  }

  latest(): Promise<StatusRecord | null> {
    return Promise.resolve(this.current);
  }
}

export class RecordingBroadcaster implements Broadcaster {
  readonly sent: { event: RealtimeEvent; data: unknown }[] = [];

  broadcast(event: RealtimeEvent, data: unknown): void {
    this.sent.push({ event, data });
  }

  eventsOf(event: RealtimeEvent): unknown[] {
    return this.sent.filter((item) => item.event === event).map((item) => item.data);
  }
}

export class FakeBroker implements MqttBroker {
  readonly published: Command[] = [];

  constructor(public connected = true) {}

  // Même refus que MqttBridge quand le broker est injoignable (contrat §4.4).
  publishCommand(command: Command): Promise<void> {
    if (!this.connected) {
      return Promise.reject(
        new ApiError("BROKER_UNAVAILABLE", "Broker MQTT injoignable, commande non envoyée"),
      );
    }
    this.published.push(command);
    return Promise.resolve();
  }
}

export interface TestApi {
  url: string;
  telemetry: FakeTelemetryRepository;
  alerts: FakeAlertRepository;
  statusRepository: FakeStatusRepository;
  realtime: RecordingBroadcaster;
  broker: FakeBroker;
  close(): Promise<void>;
}

interface StartOptions {
  config?: Partial<Config>;
  deps?: Partial<AppDeps>;
  broker?: FakeBroker;
  telemetry?: TelemetryRepository;
  alerts?: AlertRepository;
}

/** Démarre l'API sur un port libre, avec des doublures pour la base et le broker. */
export async function startApi(options: StartOptions = {}): Promise<TestApi> {
  const telemetry = (options.telemetry ?? new FakeTelemetryRepository()) as FakeTelemetryRepository;
  const alertRepository = (options.alerts ?? new FakeAlertRepository()) as FakeAlertRepository;
  const statusRepository = new FakeStatusRepository();
  const realtime = new RecordingBroadcaster();
  const broker = options.broker ?? new FakeBroker();

  const alerts = new AlertService(alertRepository, realtime);
  const status = new StatusService(statusRepository, realtime, alerts);

  const app = createApp({
    config: testConfig(options.config),
    telemetry,
    alerts,
    status,
    commands: new CommandService(broker),
    health: { db: () => Promise.resolve(true), broker: () => broker.connected },
    ...options.deps,
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    telemetry,
    alerts: alertRepository,
    statusRepository,
    realtime,
    broker,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export const authHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export const sampleTelemetry = (overrides: Partial<Telemetry> = {}): Telemetry => ({
  device: "SX-003",
  ts: 1791201234,
  seq: 1542,
  temp: 22.4,
  hum: 45.1,
  gas: 312,
  dist: 142,
  presence: 0,
  ...overrides,
});

export const sampleAlert = (overrides: Partial<Alert> = {}): Alert => ({
  device: "SX-003",
  ts: 1791201240,
  source: "ESP",
  type: "GAS",
  level: "CRITICAL",
  value: 780,
  message: "Seuil gaz local dépassé",
  ...overrides,
});

export const sampleStatus = (): Status => ({
  device: "SX-003",
  state: "online",
  ip: "192.168.10.20",
  rssi: -58,
  uptime_s: 3600,
  fw: "1.0.0",
});
