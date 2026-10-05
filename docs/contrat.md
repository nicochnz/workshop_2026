# Contrat d'interface — Sentinel-X

> Document de référence partagé par DEV, IA, INFRA et CYBER.
> Tout le code (firmware, API, simulateur, script IA, dashboard) **doit** respecter ce contrat.
> Toute modification passe par une PR qui met à jour ce fichier **et** la version ci-dessous.

| Version | Date       | Changement        |
|---------|------------|-------------------|
| 1.0     | 2026-10-05 | Version initiale  |
| 1.1     | 2026-10-05 | Groupe 3 figé, client IDs MQTT, seuils d'alerte ESP, réponses GET, codes d'erreur, rate limits, WebSocket détaillé (§5), variables d'environnement (§8) |
| 1.2     | 2026-10-05 | PIR remplacé par capteur ultrason : `pir` → `dist` + `presence` (§3.1), règle `MOTION` revue (§3.2) |

---

## 1. Conventions générales

| Élément            | Valeur                                                        |
|--------------------|---------------------------------------------------------------|
| Identifiant groupe | `<grp>` = `g` + n° de groupe → **`g3`**. Variable `GROUP_ID`  |
| Identifiant boîtier| `SX-` + 3 chiffres → **`SX-003`**. Regex `^SX-\d{3}$`         |
| Encodage           | JSON UTF-8, clés en `snake_case`, pas de champ inconnu        |
| Horodatage `ts`    | Timestamp Unix **en secondes** (entier)                       |
| Heure de référence | **Celle du serveur** (`received_at`, posée par l'API)         |
| Taille max message | MQTT : 512 octets · HTTP : 4 Ko                               |

**Pourquoi l'heure serveur fait foi :** le réseau de table n'a pas forcément Internet,
l'ESP8266 peut donc ne pas avoir l'heure (NTP). Il envoie `ts = 0` tant qu'il n'est pas
synchronisé ; l'API horodate toujours elle-même chaque message à la réception.

---

## 2. Topics MQTT

Broker : Mosquitto sur le PC Serveur Local, le laptop serveur (`192.168.10.1`).
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

### Client IDs MQTT

Chaque client a un identifiant fixe et unique : le broker déconnecte l'ancien client si un
second se connecte avec le même ID (utile contre l'usurpation, gênant si deux instances tournent).

| Client       | Client ID     |
|--------------|---------------|
| ESP8266      | `sx-003`      |
| Simulateur   | `sx-003-sim`  |
| API          | `api-g3`      |
| Script IA    | `ai-g3`       |

Le simulateur et l'ESP publient sur les mêmes topics : **ne jamais les faire tourner en même temps**.

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
  "dist": 142,
  "presence": 0
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
| `dist`  | int \| null     | cm, 2 → 400            | Capteur ultrason. `null` si pas d'écho (hors portée) |
| `presence` | int          | 0 ou 1                 | 1 = `dist` < `PRESENCE_CM` (défaut **80**) sur la période |

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

#### Règles de déclenchement côté ESP

| `type`   | Condition                                   | `level`    | Anti-rafale                     |
|----------|---------------------------------------------|------------|---------------------------------|
| `GAS`    | `gas` ≥ `GAS_WARN` (défaut **400**)         | `WARNING`  | 1 alerte max / 30 s par niveau  |
| `GAS`    | `gas` ≥ `GAS_CRIT` (défaut **700**)         | `CRITICAL` | 1 alerte max / 30 s par niveau  |
| `MOTION` | `presence` passe de 0 à 1                   | `INFO`     | 1 alerte max / 30 s             |

Seuils à **calibrer** : `PRESENCE_CM` selon la position du boîtier (distance au mur ou à la porte
surveillée), gaz sur le vrai MQ-2 (valeur à l'air libre après 2 min de chauffe).
Ces seuils sont des garde-fous locaux ; la détection fine est le rôle de l'IA (`AI_PREDICT`).
En `CRITICAL` gaz, l'ESP allume la LED rouge et le buzzer localement, sans attendre le serveur.

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

**`GET /status`** — `200`. `data` = dernier message §3.3 + `received_at`, ou `null` si aucun
heartbeat reçu depuis le démarrage de l'API.

**`GET /telemetry`** — `200`. `data` = tableau des `limit` dernières mesures (§3.1 + `received_at`),
triées **de la plus ancienne à la plus récente** (prêt pour une courbe).

**`GET /alerts`** — `200`. `data` = tableau d'alertes (§3.2 + `id` + `received_at`), **plus récentes
d'abord**. `limit` 1 → 200 (défaut 50). `level` optionnel : `INFO`, `WARNING` ou `CRITICAL`.

### 4.4 Codes HTTP et codes d'erreur

| HTTP | `error.code`          | Cas                                            |
|------|-----------------------|------------------------------------------------|
| 200  | —                     | Lecture OK                                     |
| 201  | —                     | Alerte créée                                   |
| 202  | —                     | Commande publiée sur MQTT                      |
| 400  | `VALIDATION_ERROR`    | JSON invalide ou champ hors contrat            |
| 401  | `UNAUTHORIZED`        | Jeton absent ou invalide                       |
| 403  | `FORBIDDEN`           | Jeton valide mais pas le bon rôle              |
| 404  | `NOT_FOUND`           | Route inconnue                                 |
| 413  | `PAYLOAD_TOO_LARGE`   | Corps > 4 Ko                                   |
| 429  | `RATE_LIMITED`        | Trop de requêtes                               |
| 500  | `INTERNAL_ERROR`      | Erreur serveur (aucun détail interne exposé)   |
| 503  | `BROKER_UNAVAILABLE`  | Broker MQTT injoignable (commande non envoyée) |

### 4.5 Rate limiting (par IP)

| Périmètre          | Limite par défaut | Variable                 |
|--------------------|-------------------|--------------------------|
| Toutes les routes `/api/v1` | 120 req / min | `RATE_LIMIT_PER_MIN`  |
| `POST /commands`   | 20 req / min      | `CMD_RATE_LIMIT_PER_MIN` |

---

## 5. Temps réel API → dashboard (WebSocket)

URL : `ws://192.168.10.1:8080/ws` (puis `wss://` après passage TLS), même origine que le dashboard.

### 5.1 Authentification

Un navigateur ne peut pas envoyer d'en-tête `Authorization` sur un WebSocket. Le jeton est donc
envoyé dans le **premier message**, jamais dans l'URL (une URL finit dans les logs) :

```json
{ "type": "auth", "token": "<OPERATOR_TOKEN>" }
```

| Cas                                        | Réaction de l'API                  |
|--------------------------------------------|------------------------------------|
| Jeton valide                               | Envoie `{ "event": "ready" }`      |
| Jeton invalide ou premier message invalide | Ferme la connexion, code **4401**  |
| Aucun message d'auth sous 5 s              | Ferme la connexion, code **4408**  |
| Tout autre message après l'auth            | Ignoré                             |

L'API refuse aussi toute connexion dont l'en-tête `Origin` ne fait pas partie de `ALLOWED_ORIGINS`.

### 5.2 Événements

Chaque message poussé a la forme `{ "event": "<nom>", "data": { ... } }` :

| `event`     | `data`                                    |
|-------------|-------------------------------------------|
| `ready`     | absent — authentification réussie         |
| `telemetry` | Message §3.1 + `received_at`              |
| `alert`     | Message §3.2 + `id` + `received_at`       |
| `status`    | Message §3.3 + `received_at`              |
| `ack`       | Message §3.5                              |

Le dashboard ne fait **que recevoir** sur le WebSocket ; les commandes passent par `POST /commands`.
Au chargement, il récupère l'historique par REST (`GET /telemetry`, `/alerts`, `/status`) puis
suit le flux. En cas de coupure, il se reconnecte avec un délai croissant (1 s → 10 s max).

### 5.3 Jeton côté dashboard

Le dashboard n'embarque **aucun jeton** dans son code. Au premier chargement, l'opérateur saisit
`OPERATOR_TOKEN` dans un champ ; il est gardé en `sessionStorage` (effacé à la fermeture de l'onglet).
Une réponse `401` ou une fermeture `4401` efface le jeton et réaffiche la saisie.

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
| Laptop PC Serveur Local | `192.168.10.1`        | Point d'accès Wi-Fi, Docker, IA, webcam USB |
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

**Plan de secours :** la stack Docker tourne telle quelle sur n'importe quel laptop de l'équipe,
qui reprend l'IP `192.168.10.1`. Rien ne change pour l'ESP, l'IA ou le dashboard.

---

## 8. Variables d'environnement

Valeurs factices dans `.env.example` ; les vraies valeurs dans `.env` (jamais commité).

### API

| Variable                 | Exemple                         | Rôle                                     |
|--------------------------|---------------------------------|------------------------------------------|
| `PORT`                   | `8080`                          | Port HTTP de l'API + dashboard           |
| `GROUP_ID`               | `g3`                            | Construit les topics `sentinel/g3/...`   |
| `MQTT_URL`               | `mqtt://mosquitto:1883`         | Broker (`mqtts://...:8883` après TLS)    |
| `MQTT_USERNAME`          | `api`                           | Compte MQTT de l'API                     |
| `MQTT_PASSWORD`          | `change-me`                     |                                          |
| `MQTT_CA_FILE`           | `/certs/ca.crt`                 | CA pour MQTTS (vide en clair)            |
| `DATABASE_URL`           | `postgres://sentinel:change-me@db:5432/sentinel` | Connexion PostgreSQL    |
| `INGEST_TOKEN`           | 32+ caractères aléatoires       | Jeton du script IA                       |
| `OPERATOR_TOKEN`         | 32+ caractères aléatoires       | Jeton du dashboard                       |
| `ALLOWED_ORIGINS`        | `http://192.168.10.1:8080`      | Origines autorisées (WebSocket), séparées par `,` |
| `OFFLINE_TIMEOUT_S`      | `10`                            | Passage `offline` sans message reçu      |
| `RATE_LIMIT_PER_MIN`     | `120`                           | Cf. §4.5                                 |
| `CMD_RATE_LIMIT_PER_MIN` | `20`                            | Cf. §4.5                                 |

Générer un jeton : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### Script IA (pour mémoire, géré par IA)

`MQTT_URL`, `MQTT_USERNAME=ai`, `MQTT_PASSWORD`, `API_URL=http://192.168.10.1:8080/api/v1`, `INGEST_TOKEN`.

### Firmware (`secrets.h`)

`WIFI_SSID`, `WIFI_PASSWORD`, `MQTT_HOST=192.168.10.1`, `MQTT_PORT`, `MQTT_USERNAME=esp`, `MQTT_PASSWORD`, `CA_CERT`.
