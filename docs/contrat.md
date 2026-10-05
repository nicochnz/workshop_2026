# Contrat d'interface — Sentinel-X

> Document de référence partagé par DEV, IA, INFRA et CYBER.
> Tout le code (firmware, API, simulateur, script IA, dashboard) **doit** respecter ce contrat.
> Toute modification passe par une PR qui met à jour ce fichier **et** la version ci-dessous.

| Version | Date       | Changement        |
|---------|------------|-------------------|
| 1.0     | 2026-10-05 | Version initiale  |

---

## 1. Conventions générales

| Élément            | Valeur                                                        |
|--------------------|---------------------------------------------------------------|
| Identifiant groupe | `<grp>` = `g` + n° de groupe (ex. `g3`). Variable `GROUP_ID`  |
| Identifiant boîtier| `SX-` + 3 chiffres (ex. `SX-003`). Regex `^SX-\d{3}$`         |
| Encodage           | JSON UTF-8, clés en `snake_case`, pas de champ inconnu        |
| Horodatage `ts`    | Timestamp Unix **en secondes** (entier)                       |
| Heure de référence | **Celle du serveur** (`received_at`, posée par l'API)         |
| Taille max message | MQTT : 512 octets · HTTP : 4 Ko                               |

**Pourquoi l'heure serveur fait foi :** en option B le réseau de table n'a pas forcément Internet,
l'ESP8266 peut donc ne pas avoir l'heure (NTP). Il envoie `ts = 0` tant qu'il n'est pas
synchronisé ; l'API horodate toujours elle-même chaque message à la réception.

---

## 2. Topics MQTT

Broker : Mosquitto sur le PC Serveur Local (`192.168.10.1`).
Port `1883` (clair, **dev uniquement**) puis `8883` (MQTTS, cible finale).

| Topic                     | Publié par            | Écouté par      | QoS | Retain | Fréquence            |
|---------------------------|-----------------------|-----------------|-----|--------|----------------------|
| `sentinel/<grp>/telemetry`| ESP8266 / simulateur  | API, script IA  | 0   | non    | toutes les 2 s       |
| `sentinel/<grp>/alerts`   | ESP8266 / simulateur  | API             | 1   | non    | sur événement        |
| `sentinel/<grp>/status`   | ESP8266 (+ LWT)       | API             | 1   | **oui**| toutes les 10 s      |
| `sentinel/<grp>/cmd`      | API uniquement        | ESP8266         | 1   | non    | sur clic dashboard   |
| `sentinel/<grp>/ack`      | ESP8266               | API             | 1   | non    | après chaque `cmd`   |

> Le script IA **ne publie pas** d'alerte en MQTT : il passe par `POST /api/v1/alerts` (cf. §4).

### Comptes MQTT et ACL (à appliquer par INFRA/CYBER)

| Utilisateur MQTT | Publie                              | S'abonne                          |
|------------------|-------------------------------------|-----------------------------------|
| `esp`            | `telemetry`, `alerts`, `status`, `ack` | `cmd`                          |
| `api`            | `cmd`                               | `telemetry`, `alerts`, `status`, `ack` |
| `ai`             | —                                   | `telemetry`                       |

Connexion anonyme interdite (`allow_anonymous false`). Mots de passe dans `.env` / `secrets.h`.

---

## 3. Format des messages

### 3.1 `telemetry` — mesures capteurs

```json
{
  "device": "SX-003",
  "ts": 1791201234,
  "seq": 1542,
  "temp": 22.4,
  "hum": 45.1,
  "gas": 312,
  "pir": 0
}
```

| Champ   | Type            | Unité / plage          | Description                                       |
|---------|-----------------|------------------------|---------------------------------------------------|
| `device`| string          | `^SX-\d{3}$`           | Identifiant du boîtier                            |
| `ts`    | int             | ≥ 0                    | Heure ESP (0 si non synchronisée)                 |
| `seq`   | int             | ≥ 0                    | Compteur incrémental, repart à 0 au reboot        |
| `temp`  | number \| null  | °C, -40 → 80           | DHT22. `null` si lecture en échec                 |
| `hum`   | number \| null  | %, 0 → 100             | DHT22. `null` si lecture en échec                 |
| `gas`   | int             | 0 → 1023               | Valeur brute ADC du MQ-2 (A0)                     |
| `pir`   | int             | 0 ou 1                 | 1 = mouvement détecté sur la période              |

`seq` permet de détecter des messages perdus et sert de feature à l'IA.

### 3.2 `alerts` — événement grave

```json
{
  "device": "SX-003",
  "ts": 1791201240,
  "source": "ESP",
  "type": "GAS",
  "level": "CRITICAL",
  "value": 780,
  "message": "Seuil gaz local dépassé"
}
```

| Champ     | Type   | Obligatoire | Valeurs                                                        |
|-----------|--------|-------------|----------------------------------------------------------------|
| `device`  | string | oui         | `^SX-\d{3}$`                                                   |
| `ts`      | int    | oui         | ≥ 0                                                            |
| `source`  | enum   | oui         | `ESP`, `AI_VISION`, `AI_PREDICT`, `SYSTEM`                     |
| `type`    | enum   | oui         | `GAS`, `TEMP`, `MOTION`, `INTRUDER`, `ANOMALY`, `OFFLINE`      |
| `level`   | enum   | oui         | `INFO`, `WARNING`, `CRITICAL`                                  |
| `value`   | number | non         | Valeur mesurée ayant déclenché l'alerte                        |
| `score`   | number | non         | Score IA 0 → 1 (confiance YOLO ou score d'anomalie)            |
| `message` | string | non         | Texte libre, 200 caractères max                                |

Qui émet quoi :

| `source`     | `type` typiques             | Canal                    |
|--------------|-----------------------------|--------------------------|
| `ESP`        | `GAS`, `MOTION`             | MQTT `alerts`            |
| `AI_VISION`  | `INTRUDER`                  | `POST /api/v1/alerts`    |
| `AI_PREDICT` | `ANOMALY`                   | `POST /api/v1/alerts`    |
| `SYSTEM`     | `OFFLINE`                   | Générée par l'API        |

### 3.3 `status` — heartbeat

```json
{
  "device": "SX-003",
  "state": "online",
  "ip": "192.168.10.20",
  "rssi": -58,
  "uptime_s": 3600,
  "fw": "1.0.0"
}
```

| Champ      | Type   | Description                                  |
|------------|--------|----------------------------------------------|
| `device`   | string | `^SX-\d{3}$`                                 |
| `state`    | enum   | `online`, `offline`                          |
| `ip`       | string | IPv4 du boîtier (absent si `offline`)        |
| `rssi`     | int    | Force du signal Wi-Fi en dBm (absent si `offline`) |
| `uptime_s` | int    | Secondes depuis le démarrage (absent si `offline`) |
| `fw`       | string | Version du firmware (absent si `offline`)    |

**LWT (Last Will and Testament)** : à la connexion MQTT, l'ESP déclare au broker un message
« testament » publié **automatiquement par le broker** si l'ESP disparaît brutalement :

```json
{ "device": "SX-003", "state": "offline" }
```

topic `sentinel/<grp>/status`, QoS 1, retain. En complément, l'API passe le boîtier
`offline` si elle ne reçoit rien pendant **10 s** (double sécurité).

### 3.4 `cmd` — commande vers le boîtier

```json
{ "id": "c-8f3a2b", "action": "BUZZER", "state": "ON", "duration_ms": 3000 }
```

| Champ         | Type   | Obligatoire | Valeurs                                          |
|---------------|--------|-------------|--------------------------------------------------|
| `id`          | string | oui         | Généré par l'API, 1-16 caractères `[a-z0-9-]`    |
| `action`      | enum   | oui         | `BUZZER`, `LED_RED`, `LED_GREEN`, `SILENCE`      |
| `state`       | enum   | oui sauf `SILENCE` | `ON`, `OFF`                               |
| `duration_ms` | int    | non         | 0 → 10000. `0` ou absent = jusqu'à `OFF`. Le buzzer est **toujours** plafonné à 10 s par le firmware |

`SILENCE` coupe buzzer + LED rouge d'un coup (bouton d'urgence du dashboard).

### 3.5 `ack` — accusé de réception

```json
{ "id": "c-8f3a2b", "ok": true }
```

`ok: false` + `"error": "UNKNOWN_ACTION"` si la commande est invalide.
Le dashboard affiche « commande exécutée » à réception.

---

## 4. API REST

Base : `http://192.168.10.1:8080/api/v1` (puis HTTPS après passage TLS).
L'API sert aussi le dashboard en statique sur `/` (même origine → pas de CORS à gérer).

### 4.1 Format de réponse

```json
{ "data": { }, "error": null }
```
```json
{ "data": null, "error": { "code": "VALIDATION_ERROR", "message": "temp must be a number" } }
```

### 4.2 Authentification

Header `Authorization: Bearer <token>`. Deux jetons distincts, définis dans `.env` :

| Jeton            | Détenu par     | Autorise                                  |
|------------------|----------------|-------------------------------------------|
| `INGEST_TOKEN`   | Script IA      | `POST /alerts` uniquement                 |
| `OPERATOR_TOKEN` | Dashboard      | Toutes les routes de lecture + commandes  |

Comparaison en temps constant, rate limiting par IP, toutes les routes protégées sauf `/health`.

### 4.3 Routes

| Méthode | Route                         | Jeton            | Description                                   |
|---------|-------------------------------|------------------|-----------------------------------------------|
| GET     | `/health`                     | —                | `{"status":"ok"}` — healthcheck Docker         |
| GET     | `/status`                     | OPERATOR         | État courant du boîtier (dernier heartbeat)   |
| GET     | `/telemetry?limit=100`        | OPERATOR         | Dernières mesures, `limit` 1 → 1000           |
| GET     | `/alerts?limit=50&level=`     | OPERATOR         | Historique des alertes, plus récentes d'abord |
| POST    | `/alerts`                     | INGEST ou OPERATOR | Crée une alerte (format §3.2) — **obligatoire sujet** |
| POST    | `/commands`                   | OPERATOR         | Envoie une commande au boîtier (§3.4 sans `id`) |

**`POST /alerts`** — corps = §3.2. Réponse `201` :
```json
{ "data": { "id": 42, "received_at": 1791201241 }, "error": null }
```

**`POST /commands`** — corps :
```json
{ "action": "BUZZER", "state": "ON", "duration_ms": 3000 }
```
Réponse `202` (acceptée, exécution confirmée plus tard via `ack`) :
```json
{ "data": { "id": "c-8f3a2b" }, "error": null }
```

### 4.4 Codes HTTP

| Code | Cas                                         |
|------|---------------------------------------------|
| 200  | Lecture OK                                  |
| 201  | Alerte créée                                |
| 202  | Commande publiée sur MQTT                   |
| 400  | JSON invalide ou champ hors contrat         |
| 401  | Jeton absent ou invalide                    |
| 403  | Jeton valide mais pas le bon rôle           |
| 413  | Corps trop gros                             |
| 429  | Trop de requêtes                            |
| 503  | Broker MQTT injoignable (commande non envoyée) |

---

## 5. Temps réel API → dashboard (WebSocket)

Connexion WebSocket sur la même origine, authentifiée avec `OPERATOR_TOKEN`.
Événements poussés par l'API :

| Événement   | Contenu                                   |
|-------------|-------------------------------------------|
| `telemetry` | Message §3.1 + `received_at`              |
| `alert`     | Message §3.2 + `id` + `received_at`       |
| `status`    | Message §3.3 + `received_at`              |
| `ack`       | Message §3.5                              |

Le dashboard ne fait **que recevoir** sur le WebSocket ; les commandes passent par `POST /commands`.

---

## 6. Flux vidéo IA

Le script IA expose le flux webcam annoté (cadres YOLO) en **MJPEG** :

```
GET http://192.168.10.1:5000/video_feed
```

Le dashboard l'affiche via `<img src=".../video_feed">`. Résolution 640×480 max.

---

## 7. Plan d'adressage et ports (option B)

| Appareil                | IP                    | Rôle                                  |
|-------------------------|-----------------------|---------------------------------------|
| Laptop PC Serveur Local | `192.168.10.1`        | Point d'accès Wi-Fi, Docker, IA       |
| Boîtier ESP8266         | `192.168.10.20`       | Capteurs, OLED, buzzer, LEDs          |
| Postes de l'équipe      | `192.168.10.50 → .60` | Accès dashboard                       |

| Port | Service                      | Exposé sur le réseau de table |
|------|------------------------------|-------------------------------|
| 1883 | MQTT clair                   | dev uniquement, fermé en prod |
| 8883 | MQTTS                        | oui                           |
| 8080 | API + dashboard (HTTP→HTTPS) | oui                           |
| 5000 | Flux MJPEG IA                | oui                           |
| 22   | SSH par clé                  | oui                           |
| *    | Base de données              | **non** (réseau Docker interne) |
