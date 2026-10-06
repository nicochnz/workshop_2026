import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { AlertRecord, StatusRecord, TelemetryRecord } from "../src/contract.js";
import { topics } from "../src/contract.js";
import { AlertService } from "../src/services/alerts.service.js";
import { IngestService } from "../src/services/ingest.service.js";
import { StatusService } from "../src/services/status.service.js";
import { OfflineWatchdog } from "../src/services/watchdog.service.js";
import {
  FakeAlertRepository,
  FakeStatusRepository,
  FakeTelemetryRepository,
  RecordingBroadcaster,
  sampleAlert,
  sampleStatus,
  sampleTelemetry,
} from "./helpers.js";

// Chaîne boîtier → MQTT → API → base → dashboard, et rejet de tout ce qui est hors contrat.

const topic = topics("g3");

interface Harness {
  ingest: IngestService;
  telemetry: FakeTelemetryRepository;
  alerts: FakeAlertRepository;
  statusRepository: FakeStatusRepository;
  realtime: RecordingBroadcaster;
  touched: string[];
}

function harness(): Harness {
  const telemetry = new FakeTelemetryRepository();
  const alertRepository = new FakeAlertRepository();
  const statusRepository = new FakeStatusRepository();
  const realtime = new RecordingBroadcaster();
  const touched: string[] = [];

  const alerts = new AlertService(alertRepository, realtime);
  const status = new StatusService(statusRepository, realtime, alerts);
  const watchdog = new OfflineWatchdog(60_000, {
    onAlive: (device) => {
      touched.push(device);
      status.noteAlive();
    },
    onOffline: (device, reason) => status.markOffline(device, reason),
  });

  const ingest = new IngestService({
    topics: topic,
    telemetry,
    alerts,
    status,
    realtime,
    watchdog,
  });

  return { ingest, telemetry, alerts: alertRepository, statusRepository, realtime, touched };
}

/** Le pont MQTT appelle handle() sans attendre : on laisse la micro-tâche se terminer. */
const publish = async (h: Harness, topicName: string, payload: unknown): Promise<void> => {
  h.ingest.handle(topicName, Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload)));
  await new Promise((resolve) => setImmediate(resolve));
};

let h: Harness;

beforeEach(() => {
  h = harness();
});

describe("telemetry", () => {
  it("stocke la mesure, la pousse en WebSocket et réarme le watchdog", async () => {
    await publish(h, topic.telemetry, sampleTelemetry());

    assert.equal(h.telemetry.rows.length, 1);
    const stored = h.telemetry.rows[0] as TelemetryRecord;
    assert.equal(stored.seq, 1542);
    assert.ok(stored.received_at > 0, "l'API horodate elle-même (contrat §1)");

    const pushed = h.realtime.eventsOf("telemetry");
    assert.equal(pushed.length, 1);
    assert.equal((pushed[0] as TelemetryRecord).device, "SX-003");
    assert.deepEqual(h.touched, ["SX-003"]);
  });

  it("ignore un message hors contrat sans rien écrire", async () => {
    const invalid = { device: "SX-003", ts: -1, seq: "abc", temp: "hot", gas: 5000, presence: 2 };
    await publish(h, topic.telemetry, invalid);

    assert.equal(h.telemetry.rows.length, 0);
    assert.equal(h.realtime.sent.length, 0);
    assert.deepEqual(h.touched, []);
  });

  it("ignore un JSON invalide", async () => {
    await publish(h, topic.telemetry, "{ pas du json");
    assert.equal(h.telemetry.rows.length, 0);
  });

  it("ignore un message au-delà de 512 octets (contrat §1)", async () => {
    const oversized = { ...sampleTelemetry(), device: "SX-003" };
    const payload = Buffer.alloc(600, 0x61);
    h.ingest.handle(topic.telemetry, payload);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(h.telemetry.rows.length, 0);
    assert.ok(JSON.stringify(oversized).length < 512, "un message conforme tient dans 512 octets");
  });
});

describe("alerts", () => {
  it("stocke l'alerte ESP et la pousse avec son id", async () => {
    await publish(h, topic.alerts, sampleAlert());

    assert.equal(h.alerts.rows.length, 1);
    const pushed = h.realtime.eventsOf("alert")[0] as AlertRecord;
    assert.equal(pushed.type, "GAS");
    assert.equal(pushed.id, 1);
    assert.ok(pushed.received_at > 0);
  });

  it("rejette une alerte hors contrat", async () => {
    await publish(h, topic.alerts, { ...sampleAlert(), level: "FATAL" });
    assert.equal(h.alerts.rows.length, 0);
  });
});

describe("status", () => {
  it("enregistre le heartbeat et le diffuse", async () => {
    await publish(h, topic.status, sampleStatus());

    assert.equal(h.statusRepository.current?.state, "online");
    const pushed = h.realtime.eventsOf("status")[0] as StatusRecord;
    assert.equal(pushed.state, "online");
    assert.ok(pushed.received_at > 0);
  });

  it("traite le testament offline et émet une alerte SYSTEM/OFFLINE unique", async () => {
    await publish(h, topic.status, sampleStatus());
    await publish(h, topic.status, { device: "SX-003", state: "offline" });
    await publish(h, topic.status, { device: "SX-003", state: "offline" });

    assert.equal(h.statusRepository.current?.state, "offline");
    const alerts = h.alerts.rows;
    assert.equal(alerts.length, 1, "une seule alerte par coupure");
    assert.equal(alerts[0]?.source, "SYSTEM");
    assert.equal(alerts[0]?.type, "OFFLINE");
  });

  it("ne réarme pas le watchdog sur un offline", async () => {
    await publish(h, topic.status, { device: "SX-003", state: "offline" });
    assert.deepEqual(h.touched, []);
  });
});

describe("ack", () => {
  it("pousse l'accusé au dashboard sans rien stocker", async () => {
    await publish(h, topic.ack, { id: "c-8f3a2b", ok: true });

    assert.deepEqual(h.realtime.eventsOf("ack"), [{ id: "c-8f3a2b", ok: true }]);
    assert.equal(h.alerts.rows.length, 0);
    assert.equal(h.telemetry.rows.length, 0);
  });

  it("rejette un ack hors contrat", async () => {
    await publish(h, topic.ack, { id: "c-1", ok: "yes" });
    assert.equal(h.realtime.sent.length, 0);
  });
});

describe("topic inattendu", () => {
  it("est ignoré", async () => {
    await publish(h, "sentinel/g3/evil", sampleTelemetry());
    assert.equal(h.telemetry.rows.length, 0);
    assert.equal(h.realtime.sent.length, 0);
  });
});
