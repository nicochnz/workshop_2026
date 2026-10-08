import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ackSchema,
  alertSchema,
  commandRequestSchema,
  statusSchema,
  telemetrySchema,
  topics,
} from "../src/contract.js";
import { sampleAlert, sampleStatus, sampleTelemetry } from "./helpers.js";

// Les schémas sont la première barrière de l'API : ce qui est hors contrat n'entre pas.

describe("telemetry (§3.1)", () => {
  it("accepte le message du contrat", () => {
    assert.equal(telemetrySchema.safeParse(sampleTelemetry()).success, true);
  });

  it("accepte temp, hum et dist à null (lecture capteur en échec)", () => {
    const parsed = telemetrySchema.safeParse(sampleTelemetry({ temp: null, hum: null, dist: null }));
    assert.equal(parsed.success, true);
  });

  it("rejette le message hors contrat du simulateur (touche x)", () => {
    const invalid = {
      device: "SX-003",
      ts: -1,
      seq: "abc",
      temp: "hot",
      gas: 5000,
      presence: 2,
      evil: "<script>",
    };
    assert.equal(telemetrySchema.safeParse(invalid).success, false);
  });

  it("rejette un champ inconnu", () => {
    const parsed = telemetrySchema.safeParse({ ...sampleTelemetry(), extra: 1 });
    assert.equal(parsed.success, false);
  });

  it("rejette les valeurs hors plage et les types incorrects", () => {
    const cases = [
      { gas: 1024 },
      { gas: 12.5 },
      { temp: 120 },
      { hum: -1 },
      { dist: 1 },
      { dist: 401 },
      { presence: 2 },
      { ts: -1 },
      { device: "SX-3" },
      { temp: "22.4" as unknown as number },
    ];
    for (const override of cases) {
      const parsed = telemetrySchema.safeParse({ ...sampleTelemetry(), ...override });
      assert.equal(parsed.success, false, `devrait rejeter ${JSON.stringify(override)}`);
    }
  });

  it("exige tous les champs obligatoires", () => {
    const { seq, ...withoutSeq } = sampleTelemetry();
    assert.ok(seq !== undefined);
    assert.equal(telemetrySchema.safeParse(withoutSeq).success, false);
  });
});

describe("alerts (§3.2)", () => {
  it("accepte une alerte ESP et une alerte IA avec score", () => {
    assert.equal(alertSchema.safeParse(sampleAlert()).success, true);
    const vision = alertSchema.safeParse(
      sampleAlert({ source: "AI_VISION", type: "INTRUDER", level: "CRITICAL", score: 0.92 }),
    );
    assert.equal(vision.success, true);
  });

  it("rejette un score hors de 0 → 1", () => {
    assert.equal(alertSchema.safeParse(sampleAlert({ score: 1.5 })).success, false);
    assert.equal(alertSchema.safeParse(sampleAlert({ score: -0.1 })).success, false);
  });

  it("rejette une source, un type ou un niveau inconnus", () => {
    for (const override of [{ source: "HACKER" }, { type: "BOOM" }, { level: "FATAL" }]) {
      const parsed = alertSchema.safeParse({ ...sampleAlert(), ...override });
      assert.equal(parsed.success, false, `devrait rejeter ${JSON.stringify(override)}`);
    }
  });

  it("rejette un message de plus de 200 caractères", () => {
    const parsed = alertSchema.safeParse(sampleAlert({ message: "a".repeat(201) }));
    assert.equal(parsed.success, false);
  });
});

describe("status (§3.3)", () => {
  it("accepte un heartbeat online complet", () => {
    assert.equal(statusSchema.safeParse(sampleStatus()).success, true);
  });

  it("accepte le testament offline (device + state seuls)", () => {
    const parsed = statusSchema.safeParse({ device: "SX-003", state: "offline" });
    assert.equal(parsed.success, true);
  });

  it("rejette un online incomplet et une IP invalide", () => {
    assert.equal(statusSchema.safeParse({ device: "SX-003", state: "online" }).success, false);
    const badIp = statusSchema.safeParse({ ...sampleStatus(), ip: "192.168.10" });
    assert.equal(badIp.success, false);
  });

  it("rejette les champs online sur un offline", () => {
    const parsed = statusSchema.safeParse({ device: "SX-003", state: "offline", rssi: -58 });
    assert.equal(parsed.success, false);
  });
});

describe("commandes (§3.4) et ack (§3.5)", () => {
  it("accepte les quatre actions du contrat", () => {
    assert.equal(commandRequestSchema.safeParse({ action: "BUZZER", state: "ON" }).success, true);
    assert.equal(commandRequestSchema.safeParse({ action: "LED_RED", state: "OFF" }).success, true);
    assert.equal(commandRequestSchema.safeParse({ action: "LED_GREEN", state: "ON" }).success, true);
    assert.equal(commandRequestSchema.safeParse({ action: "SILENCE" }).success, true);
  });

  it("exige state sauf pour SILENCE", () => {
    assert.equal(commandRequestSchema.safeParse({ action: "BUZZER" }).success, false);
  });

  it("rejette une action inconnue, un id imposé et une durée hors plage", () => {
    assert.equal(commandRequestSchema.safeParse({ action: "EXPLODE", state: "ON" }).success, false);
    const forcedId = commandRequestSchema.safeParse({ id: "c-1", action: "SILENCE" });
    assert.equal(forcedId.success, false);
    const tooLong = commandRequestSchema.safeParse({
      action: "BUZZER",
      state: "ON",
      duration_ms: 99999,
    });
    assert.equal(tooLong.success, false);
  });

  it("valide un ack", () => {
    assert.equal(ackSchema.safeParse({ id: "c-8f3a2b", ok: true }).success, true);
    assert.equal(ackSchema.safeParse({ id: "c-1", ok: false, error: "UNKNOWN_ACTION" }).success, true);
    assert.equal(ackSchema.safeParse({ id: "C-1", ok: true }).success, false);
  });
});

describe("topics (§2)", () => {
  it("construit les topics du groupe", () => {
    assert.deepEqual(topics("g3"), {
      telemetry: "sentinel/g3/telemetry",
      alerts: "sentinel/g3/alerts",
      status: "sentinel/g3/status",
      cmd: "sentinel/g3/cmd",
      ack: "sentinel/g3/ack",
    });
  });
});
