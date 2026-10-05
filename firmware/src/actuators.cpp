#include "actuators.h"

#include "config.h"

struct ActuatorState {
  bool on;
  bool timed;
  uint32_t offAt;
};

static ActuatorState states[3] = {};
static const char* const NAMES[3] = {"Buzzer", "LED rouge", "LED verte"};

static uint8_t pinOf(Actuator a) {
  switch (a) {
    case Actuator::Buzzer: return PIN_BUZZER;
    case Actuator::LedRed: return PIN_LED_RED;
    default: return PIN_LED_GREEN;
  }
}

// tone() fonctionne avec un buzzer passif comme actif.
static void apply(Actuator a, bool on) {
  if (a != Actuator::Buzzer) {
    digitalWrite(pinOf(a), on ? HIGH : LOW);
  } else if (on) {
    tone(PIN_BUZZER, BUZZER_FREQ_HZ);
  } else {
    noTone(PIN_BUZZER);
  }
}

void actuatorsBegin() {
  for (Actuator a : {Actuator::Buzzer, Actuator::LedRed, Actuator::LedGreen}) {
    pinMode(pinOf(a), OUTPUT);
    apply(a, false);
  }
}

void actuatorSet(Actuator a, bool on, uint32_t durationMs) {
  if (a == Actuator::Buzzer && on && (durationMs == 0 || durationMs > BUZZER_MAX_MS)) {
    durationMs = BUZZER_MAX_MS;
  }

  ActuatorState& s = states[static_cast<uint8_t>(a)];
  s.on = on;
  s.timed = on && durationMs > 0;
  s.offAt = millis() + durationMs;
  apply(a, on);

  Serial.printf("[ACT] %s %s", NAMES[static_cast<uint8_t>(a)], on ? "ON" : "OFF");
  if (s.timed) Serial.printf(" (%u ms)", durationMs);
  Serial.println();
}

void actuatorsTick() {
  for (Actuator a : {Actuator::Buzzer, Actuator::LedRed, Actuator::LedGreen}) {
    const ActuatorState& s = states[static_cast<uint8_t>(a)];
    // Comparaison signée : reste correcte quand millis() repasse par 0 (~49 jours)
    if (s.on && s.timed && static_cast<int32_t>(millis() - s.offAt) >= 0) {
      actuatorSet(a, false);
    }
  }
}

void actuatorsSilence() {
  actuatorSet(Actuator::Buzzer, false);
  actuatorSet(Actuator::LedRed, false);
}

void actuatorsGasAlarm() {
  actuatorSet(Actuator::LedRed, true);
  actuatorSet(Actuator::Buzzer, true, BUZZER_MAX_MS);
}
