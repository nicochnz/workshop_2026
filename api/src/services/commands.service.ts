import { randomBytes } from "node:crypto";
import type { Command, CommandRequest } from "../contract.js";
import { logger } from "../logger.js";
import type { MqttBroker } from "../mqtt/bridge.js";

/**
 * Dashboard → API → MQTT `cmd` → boîtier (contrat §3.4). L'`id` est généré ici :
 * le client ne le choisit pas, et il permet de rapprocher l'`ack` de la commande.
 */
export class CommandService {
  constructor(private readonly broker: MqttBroker) {}

  async send(request: CommandRequest): Promise<{ id: string }> {
    const command: Command = { ...request, id: newCommandId() };
    await this.broker.publishCommand(command);
    logger.info(`Commande ${command.id} publiée : ${command.action} ${command.state ?? ""}`.trim());
    return { id: command.id };
  }
}

/** `c-` + 6 caractères hexadécimaux : conforme à `^[a-z0-9-]{1,16}$`. */
function newCommandId(): string {
  return `c-${randomBytes(3).toString("hex")}`;
}
