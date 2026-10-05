#include "network.h"

#include <ESP8266WiFi.h>
#include <MQTT.h>
#include <time.h>

#include "config.h"

static WiFiClient net;
static MQTTClient mqtt(MQTT_BUFFER_SIZE);

static MessageHandler messageHandler = nullptr;
static ConnectHandler connectHandler = nullptr;

static bool wifiWasUp = false;
static bool mqttAttempted = false;
static uint32_t lastMqttAttempt = 0;

// Interdit d'utiliser le client MQTT ici (publish/subscribe) : on délègue au handler,
// qui met les réponses en file pour la boucle principale.
static void onMqttMessage(MQTTClient*, char topic[], char bytes[], int length) {
  if (messageHandler) messageHandler(topic, bytes, length);
}

void networkBegin(MessageHandler onMessage, ConnectHandler onConnect) {
  messageHandler = onMessage;
  connectHandler = onConnect;

  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);       // n'écrit pas les identifiants en flash à chaque démarrage
  WiFi.setAutoReconnect(true);  // le SDK gère la reconnexion Wi-Fi en tâche de fond
#if USE_STATIC_IP
  WiFi.config(IPAddress(STATIC_IP), IPAddress(STATIC_GATEWAY), IPAddress(STATIC_SUBNET));
#endif
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[WIFI] Connexion a %s...\n", WIFI_SSID);

  net.setTimeout(MQTT_TIMEOUT_MS);
  mqtt.begin(MQTT_HOST, MQTT_PORT, net);
  mqtt.setOptions(MQTT_KEEPALIVE_S, true, MQTT_TIMEOUT_MS);
  mqtt.setWill(TOPIC_STATUS, OFFLINE_PAYLOAD, true, 1);
  mqtt.onMessageAdvanced(onMqttMessage);
}

static void onWifiChange(bool up) {
  if (up) {
    Serial.printf("[WIFI] Connecte, IP %s, RSSI %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    configTime(0, 0, "pool.ntp.org", MQTT_HOST);  // non bloquant ; ts = 0 tant que non synchro
  } else {
    Serial.println("[WIFI] Deconnecte, reconnexion automatique...");
  }
}

static void tryMqttConnect() {
  if (mqttAttempted && millis() - lastMqttAttempt < MQTT_RETRY_MS) return;
  mqttAttempted = true;
  lastMqttAttempt = millis();

  Serial.printf("[MQTT] Connexion a %s:%d...\n", MQTT_HOST, MQTT_PORT);
  if (!mqtt.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD)) {
    Serial.printf("[MQTT] Echec (erreur %d, code retour %d), nouvel essai dans %u s\n",
                  mqtt.lastError(), mqtt.returnCode(), MQTT_RETRY_MS / 1000);
    return;
  }

  Serial.println("[MQTT] Connecte");
  mqtt.subscribe(TOPIC_CMD, 1);
  if (connectHandler) connectHandler();
}

void networkTick() {
  const bool wifiUp = WiFi.status() == WL_CONNECTED;
  if (wifiUp != wifiWasUp) {
    wifiWasUp = wifiUp;
    onWifiChange(wifiUp);
  }
  if (!wifiUp) return;

  mqtt.loop();
  if (!mqtt.connected()) tryMqttConnect();
}

bool wifiConnected() { return WiFi.status() == WL_CONNECTED; }

bool mqttConnected() { return mqtt.connected(); }

String localIp() { return WiFi.localIP().toString(); }

int wifiRssi() { return WiFi.RSSI(); }

bool mqttPublish(const char* topic, const char* payload, bool retained, int qos) {
  if (!mqtt.connected()) return false;
  return mqtt.publish(topic, payload, retained, qos);
}

uint32_t unixTime() {
  const time_t now = time(nullptr);
  return now > 1700000000 ? static_cast<uint32_t>(now) : 0;
}
