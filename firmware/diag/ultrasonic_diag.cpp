// Diagnostic du capteur ultrason HC-SR04, isolé du reste du firmware.
// Flasher : pio run -e diag-ultrason -t upload   puis   pio device monitor
//
// Pour chaque mesure, la broche ECHO est observée en continu pendant 50 ms après le
// déclenchement : on voit si un signal arrive, même trop faible ou trop bref pour pulseIn.
// Sans danger : ECHO passe par le pont diviseur (1 kΩ en série), qui limite le courant.

#include <Arduino.h>

constexpr uint8_t TRIG = D3;
constexpr uint8_t ECHO = D6;
constexpr uint32_t WATCH_US = 50000;

struct Observation {
  uint32_t highSamples;  // nombre de lectures à HIGH
  uint32_t samples;
  uint32_t firstHighUs;  // délai avant le premier HIGH (0 = jamais)
  uint32_t longestHighUs;
};

static Observation observe(uint32_t triggerUs) {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(4);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(triggerUs);
  digitalWrite(TRIG, LOW);

  Observation o = {0, 0, 0, 0};
  const uint32_t start = micros();
  uint32_t highSince = 0;
  bool wasHigh = false;
  while (micros() - start < WATCH_US) {
    const uint32_t t = micros() - start;
    const bool high = digitalRead(ECHO);
    o.samples++;
    if (high) {
      o.highSamples++;
      if (o.firstHighUs == 0) o.firstHighUs = t ? t : 1;
      if (!wasHigh) highSince = t;
    } else if (wasHigh) {
      o.longestHighUs = max(o.longestHighUs, t - highSince);
    }
    wasHigh = high;
  }
  if (wasHigh) o.longestHighUs = max(o.longestHighUs, WATCH_US - highSince);
  return o;
}

static void report(uint32_t triggerUs) {
  const Observation o = observe(triggerUs);
  Serial.printf("  impulsion %2u us : %5u/%u lectures HIGH", triggerUs, o.highSamples, o.samples);
  if (o.highSamples == 0) {
    Serial.println(" -> aucun signal");
  } else {
    Serial.printf(" | 1er HIGH a %u us | plus long HIGH %u us = %u cm\n", o.firstHighUs, o.longestHighUs,
                  o.longestHighUs / 58);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  delay(500);
  Serial.println("\n=== Diagnostic HC-SR04 (observation continue) ===");
}

// Force ECHO à LOW 1 ms puis la relâche : une ligne tirée vers le haut remonte aussitôt,
// une ligne flottante (non connectée) reste à LOW un moment.
static void floatingTest() {
  pinMode(ECHO, OUTPUT);
  digitalWrite(ECHO, LOW);
  delay(1);
  pinMode(ECHO, INPUT);
  delayMicroseconds(10);
  const int at10us = digitalRead(ECHO);
  delay(1);
  const int at1ms = digitalRead(ECHO);
  delay(49);
  const int at50ms = digitalRead(ECHO);
  Serial.printf("Test flottant : apres relachement -> 10us=%d 1ms=%d 50ms=%d\n", at10us, at1ms, at50ms);
}

void loop() {
  floatingTest();
  Serial.printf("ECHO au repos : %s\n", digitalRead(ECHO) ? "HIGH" : "LOW");
  report(10);
  delay(60);
  report(20);
  delay(500);
}
