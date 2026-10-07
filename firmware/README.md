# Firmware SX-003 (NodeMCU V3 / ESP8266)

Lit les capteurs, affiche l'état sur l'OLED, publie en MQTT et exécute les commandes du dashboard,
au format exact du [contrat](../docs/contrat.md). Brochage : [cablage.md](../docs/cablage.md).

## Architecture du code

| Fichier | Rôle |
|---|---|
| `include/config.h` | Identité, topics, broches, cadences, seuils |
| `include/secrets.h` | Wi-Fi, MQTT, choix clair/chiffré et certificat (**ignoré par Git**, modèle : `secrets.example.h`) |
| `src/main.cpp` | Boucle principale, cadencée avec `millis()` (aucun `delay()`) |
| `src/network.*` | Wi-Fi + MQTT ou MQTTS (BearSSL), reconnexion non bloquante, LWT, heure |
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

Ces premiers tests se font **en clair** (`USE_TLS 0`, `MQTT_PORT 1883`). Le passage en MQTTS
vient ensuite : voir [Passer en MQTTS](#passer-en-mqtts-chiffré).

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

## Passer en MQTTS (chiffré)

Une fois le boîtier validé en clair. Le réglage se fait entièrement dans `include/secrets.h` :

| Réglage | Chiffré (cible) | En clair (plan B) |
|---|---|---|
| `USE_TLS` | `1` | `0` |
| `MQTT_PORT` | `8883` | `1883` |
| `CA_CERT` | contenu de `certs/public/ca.crt` | ignoré |

**1. Certificats.** Sur le PC qui fait tourner le broker : `./scripts/generate-certs.sh`
([docs/tls.md](../docs/tls.md)). Hors réseau de table, ajouter l'IP du PC **sous les deux formes**,
sinon l'ESP refuse le certificat :

```bash
EXTRA_SAN="IP:192.168.1.42,DNS:192.168.1.42" ./scripts/generate-certs.sh
```

**2. `secrets.h`.** Copier le contenu de `certs/public/ca.crt` dans `CA_CERT` (entre les deux `EOF`),
puis `USE_TLS 1` et `MQTT_PORT 8883`. Ce certificat est public, mais propre à chaque installation :
s'il est régénéré avec `--renew-ca`, il faut le recoller et reflasher.

**3. Pare-feu.** Ouvrir le port 8883 entrant (PowerShell **administrateur**) :

```powershell
New-NetFirewallRule -DisplayName "MQTTS 8883" -Direction Inbound -Protocol TCP -LocalPort 8883 -Action Allow
```

**4. Compiler et flasher APRÈS avoir généré les certificats.** Le TLS vérifie la date de validité
du certificat, donc l'ESP a besoin de l'heure. Sans Internet, le firmware utilise la **date de
compilation** comme heure minimale : un firmware compilé avant la génération des certificats les
jugerait « pas encore valides ».

**5. Logs attendus.**

```
=== Sentinel-X SX-003 - firmware 1.0.0 (MQTTS) ===
[MQTT] Connexion a 192.168.10.1:8883 (MQTTS)...
[TLS] Heure de verification : NTP          (ou « date de compilation »)
[MQTT] Connecte
```

L'écran OLED affiche `MQTTS:OK` : c'est la preuve visible du chiffrement pour le jury. Côté broker,
`docker logs sx-mosquitto-dev` affiche `Client sx-003 negotiated TLSv1.2`.

| Erreur `[TLS]` dans les logs | Cause | Solution |
|---|---|---|
| Certificat expiré ou pas encore valide | Heure de l'ESP incorrecte | Recompiler et reflasher après la génération des certificats, ou mettre en place le NTP local ([docs/tls.md](../docs/tls.md) §4) |
| Certificat non reconnu (untrusted, unknown) | `CA_CERT` ne correspond pas à `certs/public/ca.crt` | Recoller le bon certificat |
| Nom du serveur refusé | `MQTT_HOST` absent du certificat | Régénérer avec `EXTRA_SAN` (étape 1) |
| Échec sans erreur `[TLS]` | Port 8883 fermé ou mauvais `MQTT_HOST` | Pare-feu (étape 3), IP du PC |

Plan B pour la démo : `USE_TLS 0` et `MQTT_PORT 1883`, puis reflasher. Le broker accepte toujours le
clair tant que `MQTT_PLAIN_LISTENER=on`.

## Diagnostic du capteur ultrason

Programme séparé qui teste uniquement le HC-SR04 (`diag/ultrasonic_diag.cpp`), pour savoir si un
problème vient du câblage, de l'alimentation ou du capteur :

```bash
pio run -e diag-ultrason -t upload
pio device monitor
```

| Ce que le moniteur affiche | Signification |
|---|---|
| Lectures HIGH dont la durée varie quand on bouge la main | Capteur et câblage OK |
| `Test flottant : ... 10us=0 1ms=0 50ms=0` et ECHO qui change d'état d'un test à l'autre | **D6 n'est reliée à rien** : vérifier la broche D6 et la rangée du pont diviseur |
| ECHO LOW stable, « aucun signal » | Capteur muet : alimentation 5 V (VU), TRIG sur D3, GND commun, ou capteur défectueux |
| ECHO HIGH permanent qui remonte aussitôt après le test flottant | ECHO reliée au 5 V sans la résistance de 1 kΩ : **débrancher**, risque pour l'ESP |

Reflasher ensuite le firmware normal : `pio run -e nodemcuv2 -t upload`.
