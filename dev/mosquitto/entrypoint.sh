#!/bin/sh
# Génère le fichier de mots de passe (hashés) à partir du .env, active les listeners, puis lance le broker.
set -eu

DATA=/mosquitto/data
PASSWD=$DATA/passwd
ACL=$DATA/acl
LISTENERS=$DATA/listeners
CERTS=$DATA/certs

rm -f "$PASSWD"
touch "$PASSWD"
chmod 0700 "$PASSWD"
mosquitto_passwd -b "$PASSWD" esp "$MQTT_ESP_PASSWORD"
mosquitto_passwd -b "$PASSWD" api "$MQTT_API_PASSWORD"
mosquitto_passwd -b "$PASSWD" ai "$MQTT_AI_PASSWORD"
mosquitto_passwd -b "$PASSWD" monitor "$MQTT_MONITOR_PASSWORD"

cp /dev-acl "$ACL"
chmod 0700 "$ACL"
chown mosquitto:mosquitto "$PASSWD" "$ACL"

rm -rf "$LISTENERS" "$CERTS"
mkdir -p "$LISTENERS"

# 1883 en clair : fallback temporaire de la démo (phase 3 : MQTT_PLAIN_LISTENER=off).
if [ "${MQTT_PLAIN_LISTENER:-on}" != "off" ]; then
  cp /dev-listeners/plain.conf "$LISTENERS/"
  echo "MQTT 1883 (clair) actif — fallback temporaire"
fi

# 8883 MQTTS dès que les certificats sont montés. Copie lisible par le seul utilisateur
# mosquitto : les fichiers montés en :ro peuvent appartenir à un autre UID sur l'hôte.
if [ -f /certs/ca.crt ] && [ -f /certs/mosquitto.crt ] && [ -f /certs/mosquitto.key ]; then
  mkdir -p "$CERTS"
  cp /certs/ca.crt /certs/mosquitto.crt /certs/mosquitto.key "$CERTS/"
  chown -R mosquitto:mosquitto "$CERTS"
  chmod 0700 "$CERTS"
  chmod 0600 "$CERTS/mosquitto.key"
  cp /dev-listeners/tls.conf "$LISTENERS/"
  echo "MQTTS 8883 actif"
else
  echo "⚠ MQTTS 8883 désactivé : certificats absents (lancer scripts/generate-certs.sh)"
fi

if [ -z "$(ls -A "$LISTENERS")" ]; then
  echo "❌ Aucun listener : générer les certificats ou remettre MQTT_PLAIN_LISTENER=on" >&2
  exit 1
fi

exec mosquitto -c /mosquitto/config/mosquitto.conf
