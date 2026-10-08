// Seuils d'alerte de l'ESP (contrat §3.2), affichés sur les courbes.
// Doivent rester alignés avec firmware/include/config.h après calibration.
export const GAS_WARN = 400;
export const GAS_CRIT = 700;
export const PRESENCE_CM = 80;

/** Délai sans mesure au-delà duquel les données sont signalées comme figées. */
export const STALE_AFTER_S = 10;

export type GasLevel = "normal" | "warning" | "critical";

export function gasLevel(gas: number): GasLevel {
  if (gas >= GAS_CRIT) return "critical";
  if (gas >= GAS_WARN) return "warning";
  return "normal";
}
