// Buzzer et LEDs, avec extinction automatique après une durée (sans delay()).
#pragma once

#include <Arduino.h>

enum class Actuator : uint8_t { Buzzer, LedRed, LedGreen };

void actuatorsBegin();

// À appeler à chaque tour de loop() : éteint ce qui a atteint sa durée.
void actuatorsTick();

// durationMs = 0 : jusqu'à OFF. Le buzzer est toujours plafonné à BUZZER_MAX_MS.
void actuatorSet(Actuator actuator, bool on, uint32_t durationMs = 0);

// Coupe buzzer + LED rouge (bouton d'urgence du dashboard).
void actuatorsSilence();

// Réaction locale à un gaz critique, sans attendre le serveur.
void actuatorsGasAlarm();
