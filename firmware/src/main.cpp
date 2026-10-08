// Sentinel-X — firmware du boîtier SX-003 (NodeMCU V3 / ESP8266).
// Tout est cadencé avec millis() : aucun delay() dans loop(), le boîtier reste réactif
// aux commandes et continue ses alertes locales même sans réseau.

#include <Arduino.h>

#include "actuators.h"
#include "alerts.h"
#include "commands.h"
#include "config.h"
#include "display.h"
#include "network.h"
#include "payloads.h"
#include "sensors.h"

// Les acks ne peuvent pas être publiés depuis le callback MQTT : file d'attente vidée dans loop().
struct PendingAck {
  char id[17];
  bool ok;
};
constexpr uint8_t ACK_QUEUE_SIZE = 4;
static PendingAck ackQueue[ACK_QUEUE_SIZE];
static uint8_t ackCount = 0;

static uint32_t seq = 0;
static uint32_t lastTelemetry = 0;
static uint32_t lastStatus = 0;
static uint32_t lastDisplay = 0;
static Reading lastReading = {NAN, NAN, 0, -1, false};

static char buffer[MQTT_BUFFER_SIZE];

static void executeCommand(const Command& cmd) {
  switch (cmd.action) {
    case CommandAction::Buzzer: actuatorSet(Actuator::Buzzer, cmd.on, cmd.durationMs); break;
    case CommandAction::LedRed: actuatorSet(Actuator::LedRed, cmd.on, cmd.durationMs); break;
    case CommandAction::LedGreen: actuatorSet(Actuator::LedGreen, cmd.on, cmd.durationMs); break;
    case CommandAction::Silence: actuatorsSilence(); break;
  }
}

static void queueAck(const char* id, bool ok) {
  if (ackCount >= ACK_QUEUE_SIZE) {
    Serial.println("[CMD] File d'acks pleine, ack perdu");
    return;
  }
  strlcpy(ackQueue[ackCount].id, id, sizeof(ackQueue[ackCount].id));
  ackQueue[ackCount].ok = ok;
  ackCount++;
}

static void onMessage(const char* topic, const char* payload, int length) {
  if (strcmp(topic, TOPIC_CMD) != 0) return;

  Command cmd;
  const ParseResult result = parseCommand(payload, length, cmd);
  if (result == ParseResult::Unreadable) {
    Serial.println("[CMD] Message illisible ignore");
    return;
  }
  if (result == ParseResult::Ok) executeCommand(cmd);
  else Serial.printf("[CMD] Commande %s rejetee\n", cmd.id);
  queueAck(cmd.id, result == ParseResult::Ok);
}

static void flushAcks() {
  if (ackCount == 0 || !mqttConnected()) return;
  for (uint8_t i = 0; i < ackCount; i++) {
    buildAck(buffer, sizeof(buffer), ackQueue[i].id, ackQueue[i].ok);
    mqttPublish(TOPIC_ACK, buffer, false, 1);
  }
  ackCount = 0;
}

static void publishStatus() {
  buildStatus(buffer, sizeof(buffer), localIp(), wifiRssi(), millis() / 1000);
  mqttPublish(TOPIC_STATUS, buffer, true, 1);
}

static void handleAlerts(const Reading& r) {
  Alert alerts[MAX_ALERTS_PER_READING];
  const int count = alertsEvaluate(r, alerts);
  for (int i = 0; i < count; i++) {
    Serial.printf("[ALERTE] %s %s (%d)\n", alerts[i].level, alerts[i].type, alerts[i].value);
    // Réaction locale immédiate, même si le serveur est injoignable
    if (strcmp(alerts[i].type, "GAS") == 0 && strcmp(alerts[i].level, "CRITICAL") == 0) actuatorsGasAlarm();

    buildAlert(buffer, sizeof(buffer), alerts[i], unixTime());
    mqttPublish(TOPIC_ALERTS, buffer, false, 1);
  }
}

static void telemetryCycle() {
  lastReading = sensorsCollect();
  handleAlerts(lastReading);

  if (!mqttConnected()) return;
  buildTelemetry(buffer, sizeof(buffer), lastReading, seq++, unixTime());
  mqttPublish(TOPIC_TELEMETRY, buffer, false, 0);
  Serial.printf("[TELEMETRIE] %s\n", buffer);
}

// Exécute `action` si `interval` ms se sont écoulées depuis `last`.
static void every(uint32_t& last, uint32_t interval, void (*action)()) {
  if (millis() - last < interval) return;
  last = millis();
  action();
}

void setup() {
  Serial.begin(115200);
  Serial.printf("\n\n=== Sentinel-X %s - firmware %s (%s) ===\n", DEVICE_ID, FW_VERSION, USE_TLS ? "MQTTS" : "MQTT clair");

  actuatorsBegin();
  sensorsBegin();
  displayBegin();
  networkBegin(onMessage, publishStatus);  // statut online publié à chaque (re)connexion MQTT
}

void loop() {
  networkTick();
  actuatorsTick();
  sensorsTick();
  flushAcks();

  every(lastTelemetry, TELEMETRY_INTERVAL_MS, telemetryCycle);
  every(lastStatus, STATUS_INTERVAL_MS, publishStatus);
  every(lastDisplay, DISPLAY_INTERVAL_MS, [] { displayRender(lastReading, wifiConnected(), mqttConnected(), localIp()); });
}
