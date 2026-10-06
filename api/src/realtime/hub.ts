import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { logger } from "../logger.js";
import { tokensMatch } from "../security/tokens.js";

// Temps réel API → dashboard (contrat §5). Le dashboard ne fait que recevoir :
// tout message reçu après l'authentification est ignoré.

export type RealtimeEvent = "telemetry" | "alert" | "status" | "ack";

export interface Broadcaster {
  broadcast(event: RealtimeEvent, data: unknown): void;
}

/** Premier message attendu : le jeton n'est jamais dans l'URL (elle finit dans les logs). */
const authSchema = z.strictObject({
  type: z.literal("auth"),
  token: z.string().min(1).max(512),
});

const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_AUTH_TIMEOUT = 4408;
const CLOSE_TOO_MANY = 1013;

const AUTH_TIMEOUT_MS = 5000;
const PING_INTERVAL_MS = 30_000;
const MAX_CLIENTS = 20;
const MAX_MESSAGE_BYTES = 1024;

interface HubOptions {
  operatorToken: string;
  allowedOrigins: string[];
  path?: string;
  authTimeoutMs?: number;
}

interface Client {
  socket: WebSocket;
  authenticated: boolean;
  alive: boolean;
  authTimer: NodeJS.Timeout;
}

export class RealtimeHub implements Broadcaster {
  private readonly server: WebSocketServer;
  private readonly clients = new Set<Client>();
  private readonly path: string;
  private readonly authTimeoutMs: number;
  private keepalive: NodeJS.Timeout | null = null;

  constructor(private readonly options: HubOptions) {
    this.path = options.path ?? "/ws";
    this.authTimeoutMs = options.authTimeoutMs ?? AUTH_TIMEOUT_MS;
    this.server = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  }

  /** Branche le WebSocket sur le serveur HTTP existant (même origine que le dashboard). */
  attach(httpServer: Server): void {
    httpServer.on("upgrade", (request, socket, head) => this.upgrade(request, socket, head));
    this.keepalive = setInterval(() => this.dropDeadClients(), PING_INTERVAL_MS);
    this.keepalive.unref();
  }

  broadcast(event: RealtimeEvent, data: unknown): void {
    const message = JSON.stringify({ event, data });
    for (const client of this.clients) {
      if (client.authenticated && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(message);
      }
    }
  }

  async close(): Promise<void> {
    if (this.keepalive) clearInterval(this.keepalive);
    for (const client of this.clients) client.socket.close(1001, "shutdown");
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    if (pathname !== this.path) return reject(socket, 404, "Not Found");

    // Un navigateur envoie toujours `Origin` : une origine absente ou non listée est refusée.
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !this.options.allowedOrigins.includes(origin)) {
      logger.warn("WebSocket refusé : origine non autorisée");
      return reject(socket, 403, "Forbidden");
    }

    if (this.clients.size >= MAX_CLIENTS) {
      logger.warn("WebSocket refusé : trop de connexions simultanées");
      return reject(socket, 503, "Service Unavailable");
    }

    this.server.handleUpgrade(request, socket, head, (ws) => this.register(ws));
  }

  private register(socket: WebSocket): void {
    if (this.clients.size >= MAX_CLIENTS) {
      socket.close(CLOSE_TOO_MANY, "too many clients");
      return;
    }

    const client: Client = {
      socket,
      authenticated: false,
      alive: true,
      authTimer: setTimeout(() => socket.close(CLOSE_AUTH_TIMEOUT, "auth timeout"), this.authTimeoutMs),
    };
    this.clients.add(client);

    socket.on("message", (raw) => this.onMessage(client, raw));
    socket.on("pong", () => (client.alive = true));
    socket.on("error", (err) => logger.error("WebSocket", err));
    socket.on("close", () => {
      clearTimeout(client.authTimer);
      this.clients.delete(client);
    });
  }

  private onMessage(client: Client, raw: unknown): void {
    // Après l'authentification, tout message entrant est ignoré (contrat §5.1).
    if (client.authenticated) return;

    if (!this.isValidAuth(raw)) {
      client.socket.close(CLOSE_UNAUTHORIZED, "unauthorized");
      return;
    }

    clearTimeout(client.authTimer);
    client.authenticated = true;
    client.socket.send(JSON.stringify({ event: "ready" }));
  }

  private isValidAuth(raw: unknown): boolean {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      return false;
    }
    const auth = authSchema.safeParse(parsed);
    return auth.success && tokensMatch(auth.data.token, this.options.operatorToken);
  }

  private dropDeadClients(): void {
    for (const client of this.clients) {
      if (!client.alive) {
        client.socket.terminate();
        continue;
      }
      client.alive = false;
      client.socket.ping();
    }
  }
}

function reject(socket: Duplex, status: number, reason: string): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}
