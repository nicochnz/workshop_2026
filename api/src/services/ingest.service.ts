import type { Topics } from "../contract.js";
import { MQTT_MAX_BYTES, ackSchema, nowSeconds, statusSchema, telemetrySchema } from "../contract.js";
import { alertSchema } from "../contract.js";
import type { TelemetryRepository } from "../db/telemetry.repo.js";
import { logger } from "../logger.js";
import type { Broadcaster } from "../realtime/hub.js";
import type { AlertService } from "./alerts.service.js";
import type { StatusService } from "./status.service.js";
import type { OfflineWatchdog } from "./watchdog.service.js";

interface IngestDeps {
  topics: Topics;
  telemetry: TelemetryRepository;
  alerts: AlertService;
  status: StatusService;
  realtime: Broadcaster;
  watchdog: OfflineWatchdog;
}

/**
 * Boîtier → MQTT → API → PostgreSQL → dashboard.
 * Tout message MQTT est hostile par défaut : taille plafonnée, JSON vérifié, schéma
 * strict. Un message non conforme est journalisé et jeté, sans jamais interrompre
 * l'abonnement ni toucher à la base.
 */
export class IngestService {
  constructor(private readonly deps: IngestDeps) {}

  /** Appelé par le pont MQTT. Ne jette jamais : les erreurs sont journalisées. */
  handle(topic: string, payload: Buffer): void {
    this.process(topic, payload).catch((err: unknown) =>
      logger.error(`Traitement du message ${topic} impossible`, err),
    );
  }

  private async process(topic: string, payload: Buffer): Promise<void> {
    if (payload.byteLength > MQTT_MAX_BYTES) {
      logger.warn(`${topic} ignoré : ${payload.byteLength} octets (max ${MQTT_MAX_BYTES})`);
      return;
    }

    const raw = parseJson(payload);
    if (raw === undefined) {
      logger.warn(`${topic} ignoré : JSON invalide`);
      return;
    }

    const { topics } = this.deps;
    switch (topic) {
      case topics.telemetry:
        return this.onTelemetry(raw);
      case topics.alerts:
        return this.onAlert(raw);
      case topics.status:
        return this.onStatus(raw);
      case topics.ack:
        return this.onAck(raw);
      default:
        logger.warn(`Topic inattendu ignoré : ${topic}`);
    }
  }

  private async onTelemetry(raw: unknown): Promise<void> {
    const parsed = telemetrySchema.safeParse(raw);
    if (!parsed.success) return reject("telemetry", parsed.error.issues[0]?.message);

    const telemetry = parsed.data;
    const received_at = nowSeconds();
    await this.deps.telemetry.insert(telemetry, received_at);
    this.deps.realtime.broadcast("telemetry", { ...telemetry, received_at });
    this.deps.watchdog.touch(telemetry.device);
  }

  private async onAlert(raw: unknown): Promise<void> {
    const parsed = alertSchema.safeParse(raw);
    if (!parsed.success) return reject("alerts", parsed.error.issues[0]?.message);

    await this.deps.alerts.record(parsed.data);
    this.deps.watchdog.touch(parsed.data.device);
  }

  private async onStatus(raw: unknown): Promise<void> {
    const parsed = statusSchema.safeParse(raw);
    if (!parsed.success) return reject("status", parsed.error.issues[0]?.message);

    await this.deps.status.apply(parsed.data);
    // Un testament `offline` ne doit pas réarmer le watchdog.
    if (parsed.data.state === "online") this.deps.watchdog.touch(parsed.data.device);
  }

  private async onAck(raw: unknown): Promise<void> {
    const parsed = ackSchema.safeParse(raw);
    if (!parsed.success) return reject("ack", parsed.error.issues[0]?.message);

    // Les accusés ne sont pas historisés : ils servent au retour visuel du dashboard (§5.2).
    this.deps.realtime.broadcast("ack", parsed.data);
  }
}

function parseJson(payload: Buffer): unknown {
  try {
    return JSON.parse(payload.toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function reject(kind: string, reason: string | undefined): void {
  logger.warn(`${kind} rejeté : ${reason ?? "hors contrat"}`);
}
