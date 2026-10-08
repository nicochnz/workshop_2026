import type { Alert, AlertLevel, AlertType, Telemetry } from "./contract.js";
import { nowSeconds } from "./contract.js";

interface Thresholds {
  gasWarn: number;
  gasCrit: number;
  cooldownS: number;
}

// Règles de déclenchement côté ESP (contrat §3.2), avec anti-rafale.
export class AlertEngine {
  private lastSent = new Map<string, number>();
  private previousPresence: 0 | 1 = 0;

  constructor(
    private readonly device: string,
    private readonly thresholds: Thresholds,
  ) {}

  evaluate(t: Telemetry): Alert[] {
    const alerts: Alert[] = [];

    const gasLevel = this.gasLevel(t.gas);
    if (gasLevel && this.canSend("GAS", gasLevel)) {
      alerts.push(this.build("GAS", gasLevel, t.gas, `Seuil gaz ${gasLevel === "CRITICAL" ? "critique" : "d'alerte"} dépassé`));
    }

    const presenceStarted = this.previousPresence === 0 && t.presence === 1;
    this.previousPresence = t.presence;
    if (presenceStarted && t.dist !== null && this.canSend("MOTION", "INFO")) {
      alerts.push(this.build("MOTION", "INFO", t.dist, `Présence détectée à ${t.dist} cm`));
    }

    return alerts;
  }

  private gasLevel(gas: number): AlertLevel | null {
    if (gas >= this.thresholds.gasCrit) return "CRITICAL";
    if (gas >= this.thresholds.gasWarn) return "WARNING";
    return null;
  }

  private canSend(type: AlertType, level: AlertLevel): boolean {
    const key = `${type}:${level}`;
    const now = nowSeconds();
    const last = this.lastSent.get(key);
    if (last !== undefined && now - last < this.thresholds.cooldownS) return false;
    this.lastSent.set(key, now);
    return true;
  }

  private build(type: AlertType, level: AlertLevel, value: number, message: string): Alert {
    return { device: this.device, ts: nowSeconds(), source: "ESP", type, level, value, message };
  }
}
