#include "alerts.h"

#include "config.h"

// 0 = jamais envoyée
static uint32_t lastGasWarn = 0;
static uint32_t lastGasCrit = 0;
static uint32_t lastMotion = 0;
static bool previousPresence = false;

static bool cooldownElapsed(uint32_t& lastSent) {
  if (lastSent != 0 && millis() - lastSent < ALERT_COOLDOWN_MS) return false;
  lastSent = millis() | 1;  // jamais 0, même si millis() vaut 0
  return true;
}

bool isGasCritical(int gas) { return gas >= GAS_CRIT; }

int alertsEvaluate(const Reading& r, Alert out[MAX_ALERTS_PER_READING]) {
  int count = 0;

  if (isGasCritical(r.gas)) {
    if (cooldownElapsed(lastGasCrit)) out[count++] = {"GAS", "CRITICAL", r.gas, "Seuil gaz critique depasse"};
  } else if (r.gas >= GAS_WARN) {
    if (cooldownElapsed(lastGasWarn)) out[count++] = {"GAS", "WARNING", r.gas, "Seuil gaz d'alerte depasse"};
  }

  const bool presenceStarted = r.presence && !previousPresence;
  previousPresence = r.presence;
  if (presenceStarted && cooldownElapsed(lastMotion)) {
    out[count++] = {"MOTION", "INFO", r.dist, "Presence detectee"};
  }

  return count;
}
