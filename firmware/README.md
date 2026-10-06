# Firmware SX-003 (NodeMCU V3 / ESP8266)

Lit les capteurs, affiche l'état sur l'OLED, publie en MQTT et exécute les commandes du dashboard,
au format exact du [contrat](../docs/contrat.md). Brochage : [cablage.md](../docs/cablage.md).

## Architecture du code

| Fichier | Rôle |
|---|---|
| `include/config.h` | Identité, topics, broches, cadences, seuils |
| `include/secrets.h` | Wi-Fi + MQTT (**ignoré par Git**, modèle : `secrets.example.h`) |
| `src/main.cpp` | Boucle principale, cadencée avec `millis()` (aucun `delay()`) |
| `src/network.*` | Wi-Fi + MQTT, reconnexion non bloquante, LWT, heure NTP |
| `src/sensors.*` | DHT11, MQ (A0), HC-SR04 |
| `src/alerts.*` | Règles d'alerte + anti-rafale 30 s |
| `src/commands.*` | Validation stricte des commandes reçues |
| `src/actuators.*` | Buzzer (plafonné à 10 s) et LEDs, extinction automatique |
| `src/payloads.*` | Construction des JSON |
| `src/display.*` | Écran OLED |

Bibliothèque MQTT : **256dpi/MQTT** (PubSubClient ne sait pas publier en QoS 1, exigé par le contrat).

## Installation

1. VS Code + extension **PlatformIO IDE** (ou CLI : `pip install platformio`).
2. Pilote USB du NodeMCU V3 : puce **CH340**. Si aucun port COM n'apparaît, installer le pilote CH340.
3. Créer les secrets :
   ```bash
   cp include/secrets.example.h include/secrets.h
   ```
   Renseigner le Wi-Fi et `MQTT_HOST` = IP du PC qui fait tourner le broker.
   Hors réseau de table (tests à la maison), mettre `USE_STATIC_IP 0`.

## Compiler, téléverser, observer

```bash
pio run                  # compiler
pio run -t upload        # téléverser (carte branchée en USB)
pio device monitor       # logs série à 115200 bauds (Ctrl+C pour quitter)
```

## Tester par étapes (sans attendre le câblage complet)

**0. Préparer le PC.** Broker de dev lancé (`docker compose -f dev/docker-compose.yml up -d`), et le
pare-feu Windows doit laisser entrer le port 1883 (PowerShell **administrateur**) :
```powershell
New-NetFirewallRule -DisplayName "MQTT dev 1883" -Direction Inbound -Protocol TCP -LocalPort 1883 -Action Allow
```
Le simulateur doit être **arrêté** (mêmes topics).

Passage en MQTTS (port 8883, `ca.crt`, heure NTP indispensable) : voir [docs/tls.md](../docs/tls.md) §4.

**1. Carte seule, rien de branché.** Dans le moniteur série :
`[WIFI] Connecte` → `[MQTT] Connecte` → une ligne `[TELEMETRIE]` toutes les 2 s
(`temp`/`hum`/`dist` à `null`, `gas` aléatoire car A0 flotte : c'est normal).

**2. Espion MQTT** sur le PC :
```bash
docker exec -it sx-mosquitto-dev mosquitto_sub -u monitor -P change-me-monitor -t "sentinel/g3/#" -v
```

**3. Commandes.** `[ACT] Buzzer ON (3000 ms)` dans les logs puis un `ack` dans l'espion :
```bash
docker exec sx-mosquitto-dev mosquitto_pub -u api -P change-me-api -t sentinel/g3/cmd -q 1 \
  -m '{"id":"c-1","action":"BUZZER","state":"ON","duration_ms":3000}'
```

**4. LWT.** Débrancher la carte → ~8 s plus tard l'espion affiche `{"device":"SX-003","state":"offline"}`.

**5. Capteurs, un par un** (carte débranchée pendant le câblage) :
OLED → DHT11 → LEDs + buzzer → HC-SR04 (**pont diviseur sur ECHO**) → MQ (**pont diviseur sur AO**).
Vérifier les valeurs dans les logs après chaque ajout.

**6. Calibration.** MQ après 2 min de chauffe : noter la valeur à l'air libre et ajuster `GAS_WARN` /
`GAS_CRIT` dans `config.h`. Ajuster `PRESENCE_CM` une fois le boîtier posé.
