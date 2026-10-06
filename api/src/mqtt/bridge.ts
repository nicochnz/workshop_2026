import { readFileSync } from "node:fs";
import mqtt from "mqtt";
import type { Command, Topics } from "../contract.js";
import { ApiError } from "../errors.js";
import { logger } from "../logger.js";

/** Ce dont les routes HTTP ont besoin du broker, sans dépendre de mqtt.js. */
export interface MqttBroker {
  readonly connected: boolean;
  publishCommand(command: Command): Promise<void>;
}

export type MqttMessageHandler = (topic: string, payload: Buffer) => void;

export interface BridgeOptions {
  url: string;
  username: string;
  password: string;
  clientId: string;
  caFile: string;
  topics: Topics;
}

const RECONNECT_PERIOD_MS = 2000;
const PUBLISH_TIMEOUT_MS = 2000;

/**
 * Connexion MQTT unique de l'API (client ID `api-g3`, contrat §2) : elle s'abonne à
 * telemetry / alerts / status / ack et publie les commandes sur cmd. mqtt.js gère la
 * file et la reconnexion automatique ; une seule instance est créée dans index.ts.
 */
export class MqttBridge implements MqttBroker {
  private client: mqtt.MqttClient | null = null;

  constructor(
    private readonly options: BridgeOptions,
    private readonly onMessage: MqttMessageHandler,
  ) {}

  get connected(): boolean {
    return this.client?.connected ?? false;
  }

  start(): void {
    if (this.client) return;

    const { topics } = this.options;
    this.client = mqtt.connect(this.options.url, {
      clientId: this.options.clientId,
      username: this.options.username,
      password: this.options.password,
      reconnectPeriod: RECONNECT_PERIOD_MS,
      clean: true,
      ...this.tlsOptions(),
    });

    this.client.on("connect", () => {
      logger.info(`MQTT connecté à ${this.options.url} (client ${this.options.clientId})`);
      // `status` est retenu côté broker : l'état courant arrive dès l'abonnement.
      this.client?.subscribe(
        {
          [topics.telemetry]: { qos: 0 },
          [topics.alerts]: { qos: 1 },
          [topics.status]: { qos: 1 },
          [topics.ack]: { qos: 1 },
        },
        (err) => {
          if (err) logger.error("MQTT abonnement impossible", err);
        },
      );
    });

    this.client.on("message", (topic, payload) => this.onMessage(topic, payload));
    this.client.on("reconnect", () => logger.warn("MQTT reconnexion en cours..."));
    this.client.on("close", () => logger.warn("MQTT connexion fermée"));
    this.client.on("error", (err) => logger.error("MQTT", err));
  }

  async publishCommand(command: Command): Promise<void> {
    const client = this.client;
    if (!client?.connected) {
      throw new ApiError("BROKER_UNAVAILABLE", "Broker MQTT injoignable, commande non envoyée");
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new ApiError("BROKER_UNAVAILABLE", "Publication MQTT expirée")),
        PUBLISH_TIMEOUT_MS,
      );
      client.publish(this.options.topics.cmd, JSON.stringify(command), { qos: 1 }, (err) => {
        clearTimeout(timer);
        if (err) reject(new ApiError("BROKER_UNAVAILABLE", "Publication MQTT impossible"));
        else resolve();
      });
    });
  }

  async stop(): Promise<void> {
    const client = this.client;
    if (!client) return;
    this.client = null;
    await new Promise<void>((resolve) => client.end(false, {}, () => resolve()));
  }

  // MQTTS (étape 5) : le CA est fourni par l'infrastructure, jamais commité.
  private tlsOptions(): mqtt.IClientOptions {
    if (!this.options.caFile) return {};
    return { ca: [readFileSync(this.options.caFile)], rejectUnauthorized: true };
  }
}
