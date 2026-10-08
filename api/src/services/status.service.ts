import type { Status, StatusRecord } from "../contract.js";
import { nowSeconds } from "../contract.js";
import type { StatusRepository } from "../db/status.repo.js";
import { logger } from "../logger.js";
import type { Broadcaster } from "../realtime/hub.js";
import type { AlertService } from "./alerts.service.js";

/**
 * État courant du boîtier (contrat §3.3). Le passage en `offline` vient soit du LWT
 * publié par le broker, soit du watchdog de l'API (contrat §3.3, double sécurité) ;
 * dans les deux cas une seule alerte `SYSTEM`/`OFFLINE` est émise par coupure.
 */
export class StatusService {
  private lastState: Status["state"] = "offline";

  constructor(
    private readonly repository: StatusRepository,
    private readonly realtime: Broadcaster,
    private readonly alerts: AlertService,
  ) {}

  async apply(status: Status): Promise<void> {
    if (status.state === "offline") {
      await this.goOffline(status.device);
      return;
    }

    const received_at = nowSeconds();
    await this.repository.upsert(status, received_at);
    if (this.lastState !== "online") logger.info(`${status.device} en ligne (${status.ip})`);
    this.lastState = "online";
    this.realtime.broadcast("status", { ...status, received_at });
  }

  /**
   * Tout message reçu du boîtier prouve qu'il est vivant, même s'il ne s'agit pas d'un
   * heartbeat. Pas d'écriture ni de diffusion ici : seul l'état interne est mis à jour,
   * pour que la prochaine coupure émette bien son alerte.
   */
  noteAlive(): void {
    this.lastState = "online";
  }

  /** Appelé par le watchdog quand plus rien n'arrive du boîtier. */
  async markOffline(device: string, reason: string): Promise<void> {
    await this.goOffline(device, reason);
  }

  current(): Promise<StatusRecord | null> {
    return this.repository.latest();
  }

  private async goOffline(device: string, reason = "Testament MQTT reçu du broker"): Promise<void> {
    if (this.lastState === "offline") return;
    this.lastState = "offline";

    const received_at = nowSeconds();
    const status: Status = { device, state: "offline" };
    await this.repository.upsert(status, received_at);
    this.realtime.broadcast("status", { ...status, received_at });
    logger.warn(`${device} hors ligne — ${reason}`);

    await this.alerts.record({
      device,
      ts: received_at,
      source: "SYSTEM",
      type: "OFFLINE",
      level: "WARNING",
      message: reason,
    });
  }
}
