#!/bin/sh
# Génère le fichier de mots de passe (hashés) à partir du .env, puis lance le broker.
set -eu

PASSWD=/mosquitto/data/passwd
ACL=/mosquitto/data/acl

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

exec mosquitto -c /mosquitto/config/mosquitto.conf
