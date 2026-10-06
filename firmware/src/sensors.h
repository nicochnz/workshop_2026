// Lecture des capteurs : DHT11 (temp/hum), MQ (gaz sur A0), HC-SR04 (distance).
#pragma once

#include <Arduino.h>

struct Reading {
  float temp;     // °C, NAN si lecture en échec
  float hum;      // %, NAN si lecture en échec
  int gas;        // 0 -> 1023, valeur brute ADC
  int dist;       // cm, -1 si pas d'écho sur la période
  bool presence;  // vrai si une mesure de la période était < PRESENCE_CM
};

void sensorsBegin();

// À appeler à chaque tour de loop() : échantillonne l'ultrason en continu.
void sensorsTick();

// Lit DHT + gaz et clôt la période ultrason. Appelé toutes les TELEMETRY_INTERVAL_MS.
Reading sensorsCollect();
