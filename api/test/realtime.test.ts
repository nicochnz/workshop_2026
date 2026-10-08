import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { WebSocket } from "ws";
import { RealtimeHub } from "../src/realtime/hub.js";
import { OPERATOR_TOKEN, sampleTelemetry } from "./helpers.js";

// WebSocket API → dashboard (contrat §5) : origine, authentification, codes de fermeture.

const ORIGIN = "http://localhost:3000";
const AUTH_TIMEOUT_MS = 80;

let server: Server;
let hub: RealtimeHub;
let url: string;

before(async () => {
  hub = new RealtimeHub({
    operatorToken: OPERATOR_TOKEN,
    allowedOrigins: [ORIGIN],
    authTimeoutMs: AUTH_TIMEOUT_MS,
  });
  server = createServer();
  hub.attach(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});

after(async () => {
  await hub.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const connect = (origin = ORIGIN): WebSocket => new WebSocket(url, { origin });

const nextMessage = (socket: WebSocket): Promise<{ event: string; data?: unknown }> =>
  new Promise((resolve, reject) => {
    socket.once("message", (raw) => resolve(JSON.parse(String(raw)) as { event: string }));
    socket.once("close", (code) => reject(new Error(`fermé (${code})`)));
  });

const nextClose = (socket: WebSocket): Promise<number> =>
  new Promise((resolve) => socket.once("close", (code) => resolve(code)));

describe("authentification (§5.1)", () => {
  it("répond ready avec un jeton valide, puis diffuse les événements", async () => {
    const socket = connect();
    await new Promise<void>((resolve) => socket.once("open", resolve));
    socket.send(JSON.stringify({ type: "auth", token: OPERATOR_TOKEN }));

    assert.deepEqual(await nextMessage(socket), { event: "ready" });

    const received = nextMessage(socket);
    hub.broadcast("telemetry", { ...sampleTelemetry(), received_at: 1791201235 });
    const message = await received;
    assert.equal(message.event, "telemetry");
    assert.equal((message.data as { device: string }).device, "SX-003");

    socket.close();
  });

  it("ferme en 4401 avec un jeton invalide", async () => {
    const socket = connect();
    await new Promise<void>((resolve) => socket.once("open", resolve));
    socket.send(JSON.stringify({ type: "auth", token: "x".repeat(40) }));
    assert.equal(await nextClose(socket), 4401);
  });

  it("ferme en 4401 si le premier message n'est pas une authentification", async () => {
    const socket = connect();
    await new Promise<void>((resolve) => socket.once("open", resolve));
    socket.send(JSON.stringify({ type: "command", action: "BUZZER" }));
    assert.equal(await nextClose(socket), 4401);
  });

  it("ferme en 4408 sans authentification dans le délai imparti", async () => {
    const socket = connect();
    await new Promise<void>((resolve) => socket.once("open", resolve));
    assert.equal(await nextClose(socket), 4408);
  });

  it("ne diffuse rien à un client non authentifié", async () => {
    const socket = connect();
    await new Promise<void>((resolve) => socket.once("open", resolve));

    let received = 0;
    socket.on("message", () => (received += 1));
    hub.broadcast("alert", { id: 1 });

    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(received, 0);
    socket.close();
  });
});

describe("origine (§5.1)", () => {
  it("refuse une origine non autorisée", async () => {
    const socket = new WebSocket(url, { origin: "http://evil.local" });
    const error = await new Promise<Error>((resolve) => socket.once("error", resolve));
    assert.match(error.message, /403/);
  });

  it("refuse une connexion sans en-tête Origin", async () => {
    const socket = new WebSocket(url);
    const error = await new Promise<Error>((resolve) => socket.once("error", resolve));
    assert.match(error.message, /403/);
  });

  it("refuse un chemin autre que /ws", async () => {
    const wrongPath = `${url.replace("/ws", "")}/socket`;
    const socket = new WebSocket(wrongPath, { origin: ORIGIN });
    const error = await new Promise<Error>((resolve) => socket.once("error", resolve));
    assert.match(error.message, /404/);
  });
});
