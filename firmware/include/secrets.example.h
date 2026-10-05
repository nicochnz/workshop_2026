// Copier ce fichier en include/secrets.h (ignoré par Git) et remplir les vraies valeurs.
#pragma once

#define WIFI_SSID     "SentinelX-G3"
#define WIFI_PASSWORD "change-me-wifi"

// Broker MQTT : IP du laptop serveur (192.168.10.1 sur le réseau de table,
// IP du PC de dev sur un autre réseau)
#define MQTT_HOST     "192.168.10.1"
#define MQTT_PORT     1883
#define MQTT_USERNAME "esp"
#define MQTT_PASSWORD "change-me-esp"

// IP fixe du boîtier (contrat §7). Mettre 0 pour utiliser le DHCP (ex. tests à la maison).
#define USE_STATIC_IP  1
#define STATIC_IP      192, 168, 10, 20
#define STATIC_GATEWAY 192, 168, 10, 1
#define STATIC_SUBNET  255, 255, 255, 0
