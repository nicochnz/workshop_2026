import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Alert, AlertRecord } from "../src/contract.js";
import type { AlertQuery, AlertRepository } from "../src/db/alerts.repo.js";
import type { TelemetryRepository } from "../src/db/telemetry.repo.js";
import type { TestApi } from "./helpers.js";
import {
  FakeBroker,
  INGEST_TOKEN,
  OPERATOR_TOKEN,
  authHeaders,
  sampleAlert,
  sampleTelemetry,
  startApi,
} from "./helpers.js";

// Routes REST du contrat §4 : codes HTTP, format { data, error }, validation, rôles.

let api: TestApi;

before(async () => {
  api = await startApi();
});

after(() => api.close());

const get = (path: string, token = OPERATOR_TOKEN) =>
  fetch(`${api.url}${path}`, { headers: authHeaders(token) });

const post = (path: string, body: unknown, token = OPERATOR_TOKEN) =>
  fetch(`${api.url}${path}`, {
    method: "POST",
    headers: authHeaders(token),
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("GET /health", () => {
  it("répond { status: ok } sans authentification", async () => {
    const response = await fetch(`${api.url}/api/v1/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });

  it("est aussi exposé sur /health pour le healthcheck Docker", async () => {
    const response = await fetch(`${api.url}/health`);
    assert.equal(response.status, 200);
  });
});

describe("authentification (§4.2)", () => {
  it("401 sans jeton", async () => {
    const response = await fetch(`${api.url}/api/v1/telemetry`);
    assert.equal(response.status, 401);
    const body = (await response.json()) as { data: null; error: { code: string } };
    assert.equal(body.data, null);
    assert.equal(body.error.code, "UNAUTHORIZED");
  });

  it("401 avec un jeton invalide", async () => {
    const response = await get("/api/v1/telemetry", "x".repeat(40));
    assert.equal(response.status, 401);
  });

  it("403 avec le jeton d'ingestion sur une route de lecture", async () => {
    const response = await get("/api/v1/telemetry", INGEST_TOKEN);
    assert.equal(response.status, 403);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "FORBIDDEN");
  });

  it("403 avec le jeton d'ingestion sur les commandes", async () => {
    const response = await post("/api/v1/commands", { action: "SILENCE" }, INGEST_TOKEN);
    assert.equal(response.status, 403);
  });
});

describe("GET /api/v1/telemetry", () => {
  before(async () => {
    for (let seq = 0; seq < 3; seq++) {
      await api.telemetry.insert(sampleTelemetry({ seq }), 1791201000 + seq);
    }
  });

  it("renvoie les mesures de la plus ancienne à la plus récente", async () => {
    const response = await get("/api/v1/telemetry");
    assert.equal(response.status, 200);
    const body = (await response.json()) as { data: { seq: number; received_at: number }[] };
    assert.deepEqual(
      body.data.map((row) => row.seq),
      [0, 1, 2],
    );
    assert.equal(body.data[0]?.received_at, 1791201000);
  });

  it("respecte limit", async () => {
    const response = await get("/api/v1/telemetry?limit=2");
    const body = (await response.json()) as { data: unknown[] };
    assert.equal(body.data.length, 2);
  });

  it("400 sur une limite hors plage ou non numérique", async () => {
    for (const query of ["?limit=0", "?limit=1001", "?limit=abc", "?limit=1.5"]) {
      const response = await get(`/api/v1/telemetry${query}`);
      assert.equal(response.status, 400, `devrait rejeter ${query}`);
      const body = (await response.json()) as { error: { code: string } };
      assert.equal(body.error.code, "VALIDATION_ERROR");
    }
  });

  it("400 sur un paramètre inconnu", async () => {
    const response = await get("/api/v1/telemetry?evil=1");
    assert.equal(response.status, 400);
  });
});

describe("GET /api/v1/status", () => {
  it("renvoie null tant qu'aucun heartbeat n'est arrivé", async () => {
    const response = await get("/api/v1/status");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: null, error: null });
  });
});

describe("POST /api/v1/alerts", () => {
  it("201 avec id et received_at, accessible au jeton d'ingestion (script IA)", async () => {
    const alert: Alert = sampleAlert({
      source: "AI_VISION",
      type: "INTRUDER",
      level: "CRITICAL",
      score: 0.92,
      message: "Personne détectée",
    });
    const response = await post("/api/v1/alerts", alert, INGEST_TOKEN);
    assert.equal(response.status, 201);

    const body = (await response.json()) as {
      data: { id: number; received_at: number };
      error: null;
    };
    assert.equal(body.error, null);
    assert.ok(body.data.id > 0);
    assert.ok(body.data.received_at > 0);
    assert.deepEqual(Object.keys(body.data).sort(), ["id", "received_at"]);
  });

  it("stocke l'alerte et la pousse en WebSocket", async () => {
    const before = api.realtime.eventsOf("alert").length;
    await post("/api/v1/alerts", sampleAlert({ source: "AI_PREDICT", type: "ANOMALY", score: 0.7 }));
    const pushed = api.realtime.eventsOf("alert");
    assert.equal(pushed.length, before + 1);
    const last = pushed.at(-1) as AlertRecord;
    assert.equal(last.source, "AI_PREDICT");
    assert.ok(last.id > 0);
  });

  it("400 sur un corps hors contrat", async () => {
    const cases: unknown[] = [
      { ...sampleAlert(), level: "FATAL" },
      { ...sampleAlert(), score: 2 },
      { ...sampleAlert(), extra: true },
      { device: "SX-003" },
      {},
    ];
    for (const body of cases) {
      const response = await post("/api/v1/alerts", body);
      assert.equal(response.status, 400, `devrait rejeter ${JSON.stringify(body)}`);
    }
  });

  it("400 sur un JSON illisible", async () => {
    const response = await post("/api/v1/alerts", "{ not json");
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  it("413 au-delà de 4 Ko", async () => {
    const response = await post("/api/v1/alerts", {
      ...sampleAlert(),
      message: "a".repeat(5000),
    });
    assert.equal(response.status, 413);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "PAYLOAD_TOO_LARGE");
  });
});

describe("GET /api/v1/alerts", () => {
  it("renvoie les alertes, plus récentes d'abord", async () => {
    const response = await get("/api/v1/alerts");
    assert.equal(response.status, 200);
    const body = (await response.json()) as { data: AlertRecord[] };
    assert.ok(body.data.length >= 2);
    assert.ok((body.data[0]?.id ?? 0) > (body.data[1]?.id ?? 0));
  });

  it("filtre par niveau et applique la limite par défaut", async () => {
    const response = await get("/api/v1/alerts?level=CRITICAL");
    assert.equal(response.status, 200);
    assert.deepEqual(api.alerts.lastQuery, { limit: 50, level: "CRITICAL" });
  });

  it("400 sur un niveau inconnu ou une limite > 200", async () => {
    assert.equal((await get("/api/v1/alerts?level=FATAL")).status, 400);
    assert.equal((await get("/api/v1/alerts?limit=201")).status, 400);
  });
});

describe("POST /api/v1/commands", () => {
  it("202 avec l'id généré, et publie sur MQTT", async () => {
    const response = await post("/api/v1/commands", {
      action: "BUZZER",
      state: "ON",
      duration_ms: 3000,
    });
    assert.equal(response.status, 202);

    const body = (await response.json()) as { data: { id: string }; error: null };
    assert.match(body.data.id, /^[a-z0-9-]{1,16}$/);
    assert.deepEqual(Object.keys(body.data), ["id"]);

    const published = api.broker.published.at(-1);
    assert.deepEqual(published, {
      id: body.data.id,
      action: "BUZZER",
      state: "ON",
      duration_ms: 3000,
    });
  });

  it("accepte SILENCE sans state", async () => {
    const response = await post("/api/v1/commands", { action: "SILENCE" });
    assert.equal(response.status, 202);
  });

  it("400 sur une action inconnue, un state manquant ou un id imposé", async () => {
    const cases: unknown[] = [
      { action: "EXPLODE", state: "ON" },
      { action: "BUZZER" },
      { action: "BUZZER", state: "MAYBE" },
      { action: "BUZZER", state: "ON", duration_ms: 99999 },
      { id: "c-pwn", action: "SILENCE" },
    ];
    for (const body of cases) {
      const response = await post("/api/v1/commands", body);
      assert.equal(response.status, 400, `devrait rejeter ${JSON.stringify(body)}`);
    }
  });

  it("503 quand le broker est injoignable", async () => {
    const offline = await startApi({ broker: new FakeBroker(false) });
    try {
      const response = await fetch(`${offline.url}/api/v1/commands`, {
        method: "POST",
        headers: authHeaders(OPERATOR_TOKEN),
        body: JSON.stringify({ action: "SILENCE" }),
      });
      assert.equal(response.status, 503);
      const body = (await response.json()) as { error: { code: string } };
      assert.equal(body.error.code, "BROKER_UNAVAILABLE");
    } finally {
      await offline.close();
    }
  });
});

describe("erreurs transverses (§4.4)", () => {
  it("404 sur une route inconnue", async () => {
    const response = await get("/api/v1/nope");
    assert.equal(response.status, 404);
    const body = (await response.json()) as { data: null; error: { code: string } };
    assert.equal(body.error.code, "NOT_FOUND");
  });

  it("404 hors /api/v1 quand aucun dashboard n'est servi", async () => {
    const response = await fetch(`${api.url}/unknown`);
    assert.equal(response.status, 404);
  });

  it("500 sans détail interne quand la base tombe", async () => {
    const broken: TelemetryRepository = {
      insert: () => Promise.reject(new Error("connexion PostgreSQL refusée")),
      latest: () => Promise.reject(new Error("connexion PostgreSQL refusée")),
    };
    const failing = await startApi({ telemetry: broken });
    try {
      const response = await fetch(`${failing.url}/api/v1/telemetry`, {
        headers: authHeaders(OPERATOR_TOKEN),
      });
      assert.equal(response.status, 500);
      const body = (await response.json()) as { error: { code: string; message: string } };
      assert.equal(body.error.code, "INTERNAL_ERROR");
      assert.doesNotMatch(body.error.message, /PostgreSQL/);
    } finally {
      await failing.close();
    }
  });

  it("500 quand l'insertion d'alerte échoue", async () => {
    const broken: AlertRepository = {
      insert: () => Promise.reject(new Error("INSERT refusé")),
      list: (_query: AlertQuery) => Promise.resolve([]),
    };
    const failing = await startApi({ alerts: broken });
    try {
      const response = await fetch(`${failing.url}/api/v1/alerts`, {
        method: "POST",
        headers: authHeaders(OPERATOR_TOKEN),
        body: JSON.stringify(sampleAlert()),
      });
      assert.equal(response.status, 500);
    } finally {
      await failing.close();
    }
  });

  it("ne divulgue pas la pile technologique", async () => {
    const response = await fetch(`${api.url}/health`);
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  });
});

describe("limitation de débit (§4.5)", () => {
  it("429 au format du contrat au-delà de la limite", async () => {
    const limited = await startApi({ config: { RATE_LIMIT_PER_MIN: 3 } });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) {
        codes.push((await fetch(`${limited.url}/api/v1/health`)).status);
      }
      assert.deepEqual(codes, [200, 200, 200, 429, 429]);

      const response = await fetch(`${limited.url}/api/v1/health`);
      const body = (await response.json()) as { data: null; error: { code: string } };
      assert.equal(body.error.code, "RATE_LIMITED");
    } finally {
      await limited.close();
    }
  });
});
