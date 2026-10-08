// Modèle de capteurs : chaque valeur tend vers une cible avec un peu de bruit,
// comme une vraie mesure. Les scénarios déplacent les cibles.

export type Scenario = "normal" | "gas_leak" | "intrusion" | "heating";

export interface Reading {
  temp: number | null;
  hum: number | null;
  gas: number;
  dist: number | null;
}

const BASELINE = { temp: 22, hum: 45, gas: 300, dist: 150 };

// Probabilité d'échec de lecture (le contrat prévoit null), pour tester l'API et l'IA.
const DHT_FAILURE_RATE = 0.01;
const ECHO_FAILURE_RATE = 0.005;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const noise = (amplitude: number) => (Math.random() * 2 - 1) * amplitude;
const round1 = (v: number) => Math.round(v * 10) / 10;

export class SensorModel {
  private temp = BASELINE.temp;
  private hum = BASELINE.hum;
  private gas = BASELINE.gas;
  private dist = BASELINE.dist;
  private heatingDrift = 0;

  scenario: Scenario = "normal";

  setScenario(scenario: Scenario): void {
    this.scenario = scenario;
    if (scenario !== "heating") this.heatingDrift = 0;
  }

  read(): Reading {
    if (this.scenario === "heating") this.heatingDrift = Math.min(this.heatingDrift + 1, 300);
    const target = this.targets();

    // Rapprochement de 15 % vers la cible à chaque mesure + bruit capteur
    this.temp = this.approach(this.temp, target.temp, 0.15, 0.15);
    this.hum = this.approach(this.hum, target.hum, 0.15, 0.4);
    this.gas = this.approach(this.gas, target.gas, 0.15, 6);
    this.dist = this.approach(this.dist, target.dist, 0.5, 3);

    return {
      temp: Math.random() < DHT_FAILURE_RATE ? null : round1(clamp(this.temp, -40, 80)),
      hum: Math.random() < DHT_FAILURE_RATE ? null : round1(clamp(this.hum, 0, 100)),
      gas: Math.round(clamp(this.gas, 0, 1023)),
      dist: Math.random() < ECHO_FAILURE_RATE ? null : Math.round(clamp(this.dist, 2, 400)),
    };
  }

  private targets(): typeof BASELINE {
    switch (this.scenario) {
      case "gas_leak":
        return { ...BASELINE, gas: 850 };
      case "intrusion":
        return { ...BASELINE, dist: 40 };
      case "heating":
        // Dérive lente et corrélée temp + gaz, sous les seuils : cas d'école pour l'IA prédictive
        return {
          ...BASELINE,
          temp: BASELINE.temp + this.heatingDrift * 0.06,
          hum: BASELINE.hum - this.heatingDrift * 0.03,
          gas: BASELINE.gas + this.heatingDrift * 0.3,
        };
      default:
        return BASELINE;
    }
  }

  private approach(current: number, target: number, rate: number, amplitude: number): number {
    return current + (target - current) * rate + noise(amplitude);
  }
}
