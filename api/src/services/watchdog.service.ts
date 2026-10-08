import { logger } from "../logger.js";

export interface WatchdogHandlers {
  /** Un message vient d'arriver du boîtier : il est vivant. */
  onAlive(device: string): void;
  /** Plus rien n'arrive depuis `OFFLINE_TIMEOUT_S`. */
  onOffline(device: string, reason: string): Promise<void>;
}

/**
 * Passe le boîtier `offline` si plus aucun message n'arrive pendant `OFFLINE_TIMEOUT_S`
 * (contrat §3.3). C'est la seconde sécurité, en plus du testament MQTT : elle couvre le
 * cas où le boîtier est injoignable alors que sa session MQTT reste ouverte côté broker.
 * Le minuteur n'est réarmé que par `touch()` : une coupure ne produit donc qu'une alerte.
 */
export class OfflineWatchdog {
  private timer: NodeJS.Timeout | null = null;
  private lastDevice: string | null = null;

  constructor(
    private readonly timeoutMs: number,
    private readonly handlers: WatchdogHandlers,
  ) {}

  /** À appeler à chaque message reçu du boîtier : relance le compte à rebours. */
  touch(device: string): void {
    this.lastDevice = device;
    this.handlers.onAlive(device);
    this.arm();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private arm(): void {
    this.stop();
    this.timer = setTimeout(() => this.fire(), this.timeoutMs);
    this.timer.unref();
  }

  private fire(): void {
    const device = this.lastDevice;
    if (!device) return;
    const reason = `Aucun message reçu depuis ${Math.round(this.timeoutMs / 1000)} s`;
    this.handlers.onOffline(device, reason).catch((err: unknown) =>
      logger.error("Watchdog : passage offline impossible", err),
    );
  }
}
