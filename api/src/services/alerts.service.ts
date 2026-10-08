import type { Alert, AlertRecord } from "../contract.js";
import { nowSeconds } from "../contract.js";
import type { AlertQuery, AlertRepository } from "../db/alerts.repo.js";
import { logger } from "../logger.js";
import type { Broadcaster } from "../realtime/hub.js";

/**
 * Point d'entrée unique de création d'alerte, quelle qu'en soit la provenance :
 * MQTT (`ESP`), `POST /api/v1/alerts` (`AI_VISION`, `AI_PREDICT`) ou watchdog (`SYSTEM`).
 * Chaque alerte est horodatée par le serveur, stockée, puis poussée au dashboard.
 */
export class AlertService {
  constructor(
    private readonly repository: AlertRepository,
    private readonly realtime: Broadcaster,
  ) {}

  async record(alert: Alert): Promise<AlertRecord> {
    const record = await this.repository.insert(alert, nowSeconds());
    this.realtime.broadcast("alert", record);
    logger.info(`Alerte #${record.id} ${record.source}/${record.type} ${record.level}`);
    return record;
  }

  list(query: AlertQuery): Promise<AlertRecord[]> {
    return this.repository.list(query);
  }
}
