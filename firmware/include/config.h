// Constantes du boîtier : identité, topics, broches, cadences et seuils (docs/contrat.md v1.2).
#pragma once

#include <Arduino.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copier include/secrets.example.h en include/secrets.h et le remplir"
#endif

// --- Identité ---
#define DEVICE_ID "SX-003"
#define GROUP_TOPIC "sentinel/g3"
constexpr const char* FW_VERSION = "1.0.0";
constexpr const char* MQTT_CLIENT_ID = "sx-003";

// --- Topics (contrat §2) ---
constexpr const char* TOPIC_TELEMETRY = GROUP_TOPIC "/telemetry";
constexpr const char* TOPIC_ALERTS = GROUP_TOPIC "/alerts";
constexpr const char* TOPIC_STATUS = GROUP_TOPIC "/status";
constexpr const char* TOPIC_CMD = GROUP_TOPIC "/cmd";
constexpr const char* TOPIC_ACK = GROUP_TOPIC "/ack";

// Message LWT, publié par le broker si le boîtier disparaît
constexpr const char* OFFLINE_PAYLOAD = "{\"device\":\"" DEVICE_ID "\",\"state\":\"offline\"}";

// --- Broches (docs/cablage.md) ---
constexpr uint8_t PIN_DHT = D5;
constexpr uint8_t PIN_TRIG = D3;  // sortie uniquement (broche de boot)
constexpr uint8_t PIN_ECHO = D6;  // via pont diviseur 5 V -> 3,3 V
constexpr uint8_t PIN_BUZZER = D7;
constexpr uint8_t PIN_LED_RED = D0;
constexpr uint8_t PIN_LED_GREEN = D8;  // sortie uniquement (broche de boot)
constexpr uint8_t PIN_GAS = A0;
constexpr uint8_t OLED_I2C_ADDR = 0x3C;  // SDA = D2, SCL = D1 (Wire par défaut)

// --- Cadences (ms) ---
constexpr uint32_t TELEMETRY_INTERVAL_MS = 2000;  // DHT11 : 1 lecture / s max
constexpr uint32_t STATUS_INTERVAL_MS = 10000;
constexpr uint32_t DIST_SAMPLE_MS = 250;
constexpr uint32_t DISPLAY_INTERVAL_MS = 1000;
constexpr uint32_t MQTT_RETRY_MS = 5000;
constexpr int MQTT_KEEPALIVE_S = 5;    // LWT déclenché ~7,5 s après une coupure
constexpr int MQTT_TIMEOUT_MS = 2000;  // borne les appels réseau bloquants

// --- Ultrason ---
constexpr uint32_t ECHO_TIMEOUT_US = 25000;  // ~4 m aller-retour
constexpr int DIST_MIN_CM = 2;
constexpr int DIST_MAX_CM = 400;

// --- Seuils d'alerte (contrat §3.2), à calibrer sur le matériel ---
constexpr int GAS_WARN = 400;
constexpr int GAS_CRIT = 700;
constexpr int PRESENCE_CM = 80;
constexpr uint32_t ALERT_COOLDOWN_MS = 30000;

// --- Actionneurs ---
constexpr uint32_t BUZZER_MAX_MS = 10000;  // plafond absolu, quelle que soit la commande
constexpr uint16_t BUZZER_FREQ_HZ = 2000;

// --- Limites ---
constexpr size_t MQTT_BUFFER_SIZE = 512;  // taille max d'un message (contrat §1)
