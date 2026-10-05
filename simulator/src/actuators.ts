import type { Ack, Command } from "./contract.js";
import { commandSchema } from "./contract.js";

// Plafond du buzzer, quelle que soit la commande (même règle que le firmware)
const BUZZER_MAX_MS = 10_000;

type Actuator = "BUZZER" | "LED_RED" | "LED_GREEN";

const LABELS: Record<Actuator, string> = {
  BUZZER: "🔔 Buzzer",
  LED_RED: "🔴 LED rouge",
  LED_GREEN: "🟢 LED verte",
};

// Simule buzzer et LEDs : affiche l'état en console et gère les durées.
export class Actuators {
  private state: Record<Actuator, boolean> = { BUZZER: false, LED_RED: false, LED_GREEN: false };
  private timers = new Map<Actuator, NodeJS.Timeout>();

  // Traite un message brut du topic cmd. Renvoie l'ack à publier, ou null si l'id est illisible.
  handle(payload: Buffer): Ack | null {
    let raw: unknown;
    try {
      raw = JSON.parse(payload.toString("utf8"));
    } catch {
      console.warn("⚠️  cmd ignorée : JSON invalide");
      return null;
    }

    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) {
      const id = readId(raw);
      console.warn(`⚠️  cmd rejetée (${parsed.error.issues[0]?.message ?? "invalide"})`);
      return id ? { id, ok: false, error: "UNKNOWN_ACTION" } : null;
    }

    this.execute(parsed.data);
    return { id: parsed.data.id, ok: true };
  }

  // Réaction locale de l'ESP en cas de gaz critique, sans attendre le serveur (contrat §3.2)
  gasCritical(): void {
    this.set("LED_RED", true);
    this.set("BUZZER", true, BUZZER_MAX_MS);
  }

  private execute(cmd: Command): void {
    if (cmd.action === "SILENCE") {
      this.set("BUZZER", false);
      this.set("LED_RED", false);
      return;
    }
    const on = cmd.state === "ON";
    const duration = cmd.action === "BUZZER" && on
      ? Math.min(cmd.duration_ms || BUZZER_MAX_MS, BUZZER_MAX_MS)
      : cmd.duration_ms;
    this.set(cmd.action, on, duration);
  }

  private set(actuator: Actuator, on: boolean, durationMs?: number): void {
    clearTimeout(this.timers.get(actuator));
    this.timers.delete(actuator);
    this.state[actuator] = on;
    console.log(`${LABELS[actuator]} ${on ? "ON" : "OFF"}${on && durationMs ? ` (${durationMs} ms)` : ""}`);

    if (on && durationMs) {
      this.timers.set(actuator, setTimeout(() => this.set(actuator, false), durationMs));
    }
  }
}

function readId(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null || !("id" in raw)) return null;
  const { id } = raw as { id: unknown };
  return typeof id === "string" && /^[a-z0-9-]{1,16}$/.test(id) ? id : null;
}
