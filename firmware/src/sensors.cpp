#include "sensors.h"

#include <DHT.h>

#include "config.h"

static DHT dht(PIN_DHT, DHT11);

static uint32_t lastDistSample = 0;
static int periodDist = -1;         // dernière distance valide de la période
static bool periodPresence = false;

void sensorsBegin() {
  dht.begin();
  pinMode(PIN_TRIG, OUTPUT);
  digitalWrite(PIN_TRIG, LOW);
  pinMode(PIN_ECHO, INPUT);
}

// Impulsion de 10 µs sur TRIG, puis mesure de la durée de l'écho.
// pulseIn bloque au plus ECHO_TIMEOUT_US (25 ms), ce qui reste acceptable.
static int measureDistanceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  const unsigned long echoUs = pulseIn(PIN_ECHO, HIGH, ECHO_TIMEOUT_US);
  if (echoUs == 0) return -1;

  const int cm = echoUs / 58;  // vitesse du son : ~58 µs par cm aller-retour
  return (cm >= DIST_MIN_CM && cm <= DIST_MAX_CM) ? cm : -1;
}

void sensorsTick() {
  if (millis() - lastDistSample < DIST_SAMPLE_MS) return;
  lastDistSample = millis();

  const int cm = measureDistanceCm();
  if (cm < 0) return;
  periodDist = cm;
  if (cm < PRESENCE_CM) periodPresence = true;
}

// Moyenne de 4 lectures pour lisser le bruit de l'ADC.
// L'ADC de l'ESP8266 peut renvoyer 1024 : on borne à 1023 (contrat).
static int readGas() {
  int sum = 0;
  for (int i = 0; i < 4; i++) sum += analogRead(PIN_GAS);
  return min(sum / 4, 1023);
}

Reading sensorsCollect() {
  Reading r;
  r.temp = dht.readTemperature();
  r.hum = dht.readHumidity();
  r.gas = readGas();
  r.dist = periodDist;
  r.presence = periodPresence;

  periodDist = -1;
  periodPresence = false;
  return r;
}
