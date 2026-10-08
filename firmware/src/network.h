// Wi-Fi + MQTT avec reconnexion automatique non bloquante et LWT.
#pragma once

#include <Arduino.h>

using MessageHandler = void (*)(const char* topic, const char* payload, int length);
using ConnectHandler = void (*)();

void networkBegin(MessageHandler onMessage, ConnectHandler onConnect);

// À appeler à chaque tour de loop() : surveille le Wi-Fi, (re)connecte MQTT, traite les messages.
void networkTick();

bool wifiConnected();
bool mqttConnected();
String localIp();
int wifiRssi();

bool mqttPublish(const char* topic, const char* payload, bool retained, int qos);

// Horodatage Unix en secondes, 0 tant que l'heure NTP n'est pas synchronisée (contrat §1).
uint32_t unixTime();
