import type { AlertLevel, AlertSource, AlertType, CommandAction } from "./types";

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  GAS: "Gaz",
  TEMP: "Température",
  MOTION: "Présence",
  INTRUDER: "Intrus détecté",
  ANOMALY: "Anomalie prédite",
  OFFLINE: "Boîtier hors ligne",
};

export const ALERT_SOURCE_LABELS: Record<AlertSource, string> = {
  ESP: "Boîtier",
  AI_VISION: "IA vision",
  AI_PREDICT: "IA prédictive",
  SYSTEM: "Système",
};

/** Icône + texte : le niveau n'est jamais porté par la couleur seule. */
export const ALERT_LEVEL_STYLES: Record<AlertLevel, { icon: string; label: string; className: string }> = {
  INFO: { icon: "ℹ", label: "Info", className: "border-info/60 text-info" },
  WARNING: { icon: "▲", label: "Attention", className: "border-warn/70 text-warn" },
  CRITICAL: { icon: "⬢", label: "Critique", className: "border-crit/80 text-crit" },
};

export const COMMAND_LABELS: Record<CommandAction, string> = {
  BUZZER: "Buzzer",
  LED_RED: "LED rouge",
  LED_GREEN: "LED verte",
  SILENCE: "Silence",
};
