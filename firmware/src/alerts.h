// Règles de déclenchement des alertes ESP (contrat §3.2), avec anti-rafale.
#pragma once

#include "sensors.h"

struct Alert {
  const char* type;     // "GAS" ou "MOTION"
  const char* level;    // "INFO", "WARNING" ou "CRITICAL"
  int value;
  const char* message;  // ASCII, < 200 caractères
};

constexpr int MAX_ALERTS_PER_READING = 2;

// Remplit `out` avec les alertes à émettre pour cette mesure. Renvoie leur nombre.
int alertsEvaluate(const Reading& r, Alert out[MAX_ALERTS_PER_READING]);

bool isGasCritical(int gas);
