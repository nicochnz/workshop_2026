import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mqttTlsOptions } from "../src/mqtt/bridge.js";
import { startApi } from "./helpers.js";

// Bascule MQTTS / fallback (docs/tls.md) et rate limiting derrière le proxy HTTPS.

const CA = Buffer.from("-----BEGIN CERTIFICATE-----");
const readCa = (path: string): Buffer => {
  if (path !== "/certs/ca.crt") throw new Error("ENOENT");
  return CA;
};

describe("options TLS MQTT", () => {
  it("mqtts:// : CA chargée et certificat du broker vérifié", () => {
    const options = mqttTlsOptions("mqtts://mosquitto:8883", "/certs/ca.crt", readCa);
    assert.deepEqual(options, { ca: [CA], rejectUnauthorized: true });
  });

  it("mqtt:// (fallback) : CA ignorée, même absente", () => {
    assert.deepEqual(mqttTlsOptions("mqtt://mosquitto:1883", "/absent/ca.crt", readCa), {});
  });

  it("mqtts:// sans MQTT_CA_FILE : refus explicite", () => {
    assert.throws(() => mqttTlsOptions("mqtts://mosquitto:8883", "", readCa), /MQTT_CA_FILE/);
  });

  it("mqtts:// avec une CA introuvable : refus explicite", () => {
    assert.throws(() => mqttTlsOptions("mqtts://mosquitto:8883", "/absent/ca.crt", readCa), /illisible/);
  });
});

async function healthCodes(trustProxy: string, forwardedFor: string[]): Promise<number[]> {
  const api = await startApi({ config: { RATE_LIMIT_PER_MIN: 1, TRUST_PROXY: trustProxy } });
  try {
    const codes: number[] = [];
    for (const ip of forwardedFor) {
      const response = await fetch(`${api.url}/api/v1/health`, { headers: { "X-Forwarded-For": ip } });
      codes.push(response.status);
    }
    return codes;
  } finally {
    await api.close();
  }
}

describe("rate limiting derrière le proxy HTTPS", () => {
  it("proxy de confiance : un quota par client réel", async () => {
    assert.deepEqual(await healthCodes("127.0.0.1", ["192.168.10.51", "192.168.10.52"]), [200, 200]);
  });

  it("sans proxy de confiance : X-Forwarded-For ignoré, pas de contournement", async () => {
    assert.deepEqual(await healthCodes("", ["192.168.10.51", "192.168.10.52"]), [200, 429]);
  });
});
