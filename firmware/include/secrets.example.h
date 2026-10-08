// Copier ce fichier en include/secrets.h (ignoré par Git) et remplir les vraies valeurs.
#pragma once

#define WIFI_SSID     "SentinelX-G3"
#define WIFI_PASSWORD "change-me-wifi"

// Broker MQTT : IP du laptop serveur (192.168.10.1 sur le réseau de table,
// IP du PC de dev sur un autre réseau)
#define MQTT_HOST     "192.168.10.1"
#define MQTT_USERNAME "esp"
#define MQTT_PASSWORD "change-me-esp"

// Chiffrement (docs/tls.md) :
//   1 = MQTTS, port 8883, certificat du serveur vérifié (mode cible)
//   0 = MQTT en clair, port 1883 (plan B de la démo)
#define USE_TLS   1
#define MQTT_PORT 8883

// Certificat de l'autorité locale : coller ici le contenu EXACT de certs/public/ca.crt
// (généré par scripts/generate-certs.sh). Il est public, mais propre à chaque installation.
// Le SAN du certificat serveur doit contenir MQTT_HOST (EXTRA_SAN="DNS:<ip>,IP:<ip>" pour un PC de dev).
static const char CA_CERT[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
... contenu de certs/public/ca.crt ...
-----END CERTIFICATE-----
)EOF";

// IP fixe du boîtier (contrat §7). Mettre 0 pour utiliser le DHCP (ex. tests à la maison).
#define USE_STATIC_IP  1
#define STATIC_IP      192, 168, 10, 20
#define STATIC_GATEWAY 192, 168, 10, 1
#define STATIC_SUBNET  255, 255, 255, 0
