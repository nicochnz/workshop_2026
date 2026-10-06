import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, it } from "node:test";
import { AlertService } from "../src/services/alerts.service.js";
import { StatusService } from "../src/services/status.service.js";
import { OfflineWatchdog } from "../src/services/watchdog.service.js";
import {
  FakeAlertRepository,
  FakeStatusRepository,
  RecordingBroadcaster,
  sampleStatus,
} from "./helpers.js";

// Double sécurité du contrat §3.3 : sans message pendant OFFLINE_TIMEOUT_S, l'API
// passe le boîtier offline elle-même, sans attendre le testament du broker.

const TIMEOUT_MS = 40;

function harness() {
  const alertRepository = new FakeAlertRepository();
  const statusRepository = new FakeStatusRepository();
  const realtime = new RecordingBroadcaster();
  const alerts = new AlertService(alertRepository, realtime);
  const status = new StatusService(statusRepository, realtime, alerts);
  const watchdog = new OfflineWatchdog(TIMEOUT_MS, {
    onAlive: () => status.noteAlive(),
    onOffline: (device, reason) => status.markOffline(device, reason),
  });
  return { alertRepository, statusRepository, realtime, status, watchdog };
}

describe("OfflineWatchdog", () => {
  it("passe offline et alerte quand plus rien n'arrive", async () => {
    const h = harness();
    await h.status.apply(sampleStatus());
    h.watchdog.touch("SX-003");

    await sleep(TIMEOUT_MS * 3);
    h.watchdog.stop();

    assert.equal(h.statusRepository.current?.state, "offline");
    assert.equal(h.alertRepository.rows.length, 1);
    assert.equal(h.alertRepository.rows[0]?.source, "SYSTEM");
    assert.equal(h.alertRepository.rows[0]?.type, "OFFLINE");
    assert.equal(h.alertRepository.rows[0]?.level, "WARNING");
    assert.match(h.alertRepository.rows[0]?.message ?? "", /Aucun message reçu/);

    const statusEvents = h.realtime.eventsOf("status");
    assert.equal((statusEvents.at(-1) as { state: string }).state, "offline");
  });

  it("n'alerte qu'une fois par coupure", async () => {
    const h = harness();
    await h.status.apply(sampleStatus());
    h.watchdog.touch("SX-003");

    await sleep(TIMEOUT_MS * 5);
    h.watchdog.stop();

    assert.equal(h.alertRepository.rows.length, 1);
  });

  it("ne déclenche rien tant que les messages arrivent", async () => {
    const h = harness();
    await h.status.apply(sampleStatus());

    for (let i = 0; i < 4; i++) {
      h.watchdog.touch("SX-003");
      await sleep(TIMEOUT_MS / 2);
    }
    h.watchdog.stop();

    assert.equal(h.alertRepository.rows.length, 0);
    assert.equal(h.statusRepository.current?.state, "online");
  });

  it("ne déclenche rien si aucun message n'est jamais arrivé", async () => {
    const h = harness();
    await sleep(TIMEOUT_MS * 3);
    h.watchdog.stop();

    assert.equal(h.alertRepository.rows.length, 0);
    assert.equal(h.statusRepository.current, null);
  });

  it("alerte même si seule la télémétrie a été reçue, sans heartbeat", async () => {
    const h = harness();
    h.watchdog.touch("SX-003");

    await sleep(TIMEOUT_MS * 3);
    h.watchdog.stop();

    assert.equal(h.statusRepository.current?.state, "offline");
    assert.equal(h.alertRepository.rows.length, 1);
  });
});
