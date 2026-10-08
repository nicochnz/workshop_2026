# API Sentinel-X

Express + TypeScript. Elle fait le lien entre le boîtier et le dashboard :

```
ESP8266 / simulateur → MQTT → API → PostgreSQL
                                 └→ WebSocket → dashboard
dashboard → POST /commands → API → MQTT cmd → boîtier (buzzer, LEDs)
script IA → POST /alerts  → API → PostgreSQL + WebSocket
```

Tout est défini par [`docs/contrat.md`](../docs/contrat.md) (v1.2) : topics, formats JSON,
routes, codes HTTP. Le code ne doit jamais s'en écarter.

## Lancement en développement

```bash
# 1. Broker MQTT + PostgreSQL de dev (depuis la racine du dépôt)
cp dev/.env.example dev/.env
docker compose -f dev/docker-compose.yml up -d

# 2. API
cd api
cp .env.example .env
# Remplacer INGEST_TOKEN et OPERATOR_TOKEN par des valeurs aléatoires :
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm install
npm run dev          # http://localhost:8080
```

Le conteneur PostgreSQL de dev est publié sur **55432** (et non 5432) pour ne pas entrer en
conflit avec un PostgreSQL déjà installé sur le poste. Le schéma (`db/schema.sql`) est
appliqué automatiquement au démarrage, et l'API réessaie 10 s si la base démarre après elle.

```bash
npm run typecheck    # TypeScript strict
npm test             # tests node:test (aucune base ni broker nécessaires)
npm run build        # dist/ pour l'image Docker
```

## Routes REST

Base : `/api/v1`. Réponses toujours au format du contrat §4.1 :
`{ "data": ..., "error": null }` ou `{ "data": null, "error": { "code", "message" } }`.

| Méthode | Route                        | Jeton              | Réponse |
|---------|------------------------------|--------------------|---------|
| GET     | `/api/v1/health`             | —                  | `200 {"status":"ok"}` |
| GET     | `/api/v1/status`             | OPERATOR           | `200` dernier heartbeat + `received_at`, ou `null` |
| GET     | `/api/v1/telemetry?limit=`   | OPERATOR           | `200` mesures, plus ancienne → plus récente (`limit` 1-1000, défaut 100) |
| GET     | `/api/v1/alerts?limit=&level=` | OPERATOR         | `200` alertes, plus récentes d'abord (`limit` 1-200, défaut 50) |
| POST    | `/api/v1/alerts`             | INGEST ou OPERATOR | `201 { "id", "received_at" }` |
| POST    | `/api/v1/commands`           | OPERATOR           | `202 { "id" }` |

`GET /health` est aussi exposé **hors** `/api/v1` : c'est la cible du healthcheck du
Dockerfile. Son code HTTP ne dépend que de PostgreSQL ; un broker momentanément absent est
signalé par `{"status":"ok","mqtt":false}` sans faire redémarrer le conteneur en pleine démo.
Base injoignable → `503 {"status":"degraded","db":false,"mqtt":…}`.

### Corps attendus

`POST /api/v1/alerts` — format §3.2. Utilisé par le script IA :

```json
{ "device": "SX-003", "ts": 1791201240, "source": "AI_VISION", "type": "INTRUDER",
  "level": "CRITICAL", "score": 0.92, "message": "Personne détectée" }
```

`source` : `ESP`, `AI_VISION`, `AI_PREDICT`, `SYSTEM` · `type` : `GAS`, `TEMP`, `MOTION`,
`INTRUDER`, `ANOMALY`, `OFFLINE` · `level` : `INFO`, `WARNING`, `CRITICAL` ·
`score` (confiance YOLO ou score d'anomalie) entre 0 et 1 · `message` 200 caractères max.
L'API ne fait **aucune** inférence : elle valide, stocke et diffuse les résultats de l'IA.

`POST /api/v1/commands` — format §3.4 **sans** `id` (généré par l'API) :

```json
{ "action": "BUZZER", "state": "ON", "duration_ms": 3000 }
```

`action` : `BUZZER`, `LED_RED`, `LED_GREEN`, `SILENCE` · `state` obligatoire sauf pour
`SILENCE` · `duration_ms` 0 → 10000.

### Codes d'erreur (contrat §4.4)

| HTTP | `error.code`         | Cas |
|------|----------------------|-----|
| 400  | `VALIDATION_ERROR`   | JSON invalide, champ hors contrat, champ inconnu, paramètre de requête inconnu |
| 401  | `UNAUTHORIZED`       | Jeton absent ou invalide |
| 403  | `FORBIDDEN`          | Jeton valide mais rôle insuffisant (ex. `INGEST_TOKEN` en lecture) |
| 404  | `NOT_FOUND`          | Route inconnue |
| 413  | `PAYLOAD_TOO_LARGE`  | Corps > 4 Ko |
| 429  | `RATE_LIMITED`       | 120 req/min par IP, 20 req/min sur `POST /commands` |
| 500  | `INTERNAL_ERROR`     | Erreur serveur, aucun détail interne exposé |
| 503  | `BROKER_UNAVAILABLE` | Broker MQTT injoignable, commande non publiée |

## WebSocket (contrat §5)

`ws://<hôte>:8080/ws`, ou `wss://<hôte>/ws` derrière le proxy HTTPS. L'origine doit figurer dans `ALLOWED_ORIGINS`, sans quoi la connexion
est refusée (`403` à la négociation). Premier message obligatoire, dans les 5 s :

```json
{ "type": "auth", "token": "<OPERATOR_TOKEN>" }
```

Réponse `{ "event": "ready" }`. Jeton invalide → fermeture **4401**, pas d'authentification
dans le délai → **4408**. Ensuite l'API pousse `{ "event": "...", "data": ... }` :

| `event`     | `data` |
|-------------|--------|
| `telemetry` | message §3.1 + `received_at` |
| `alert`     | message §3.2 + `id` + `received_at` (toutes sources, IA comprise) |
| `status`    | message §3.3 + `received_at` |
| `ack`       | message §3.5 |

Le dashboard ne fait que recevoir : les commandes passent par `POST /api/v1/commands`.

## Topics MQTT

Client ID `api-g3`, compte `api` (contrat §2). L'API **s'abonne** à
`sentinel/<grp>/telemetry` (QoS 0), `alerts`, `status` et `ack` (QoS 1), et **publie**
uniquement sur `sentinel/<grp>/cmd` (QoS 1). Une seule connexion MQTT pour tout le process ;
reconnexion automatique toutes les 2 s. `status` étant retenu par le broker, l'état courant
arrive dès l'abonnement.

Un message MQTT de plus de 512 octets, mal formé ou hors contrat est journalisé puis jeté :
il n'atteint jamais la base.

## Base de données

PostgreSQL, trois tables (`db/schema.sql`) : `telemetry`, `alerts`, `device_status`.
`received_at` est toujours posé par l'API — l'heure du serveur fait foi (contrat §1), l'ESP
pouvant envoyer `ts = 0` tant qu'il n'est pas synchronisé. Toutes les requêtes sont
paramétrées, aucune concaténation SQL.

## Variables d'environnement

Contrat §8. Aucune valeur par défaut pour les secrets : l'API refuse de démarrer sans eux.
Modèle complet dans [`.env.example`](.env.example).

| Variable | Défaut | Rôle |
|----------|--------|------|
| `NODE_ENV` | `production` | `development` active le CORS pour `ALLOWED_ORIGINS` |
| `PORT` | `8080` | Port HTTP (API + dashboard) |
| `GROUP_ID` | `g3` | Construit les topics `sentinel/g3/...` |
| `MQTT_URL` | `mqtt://localhost:1883` | Broker. Cible : `mqtts://mosquitto:8883` ; fallback démo : `mqtt://mosquitto:1883` |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | `api` / — | Compte MQTT de l'API |
| `MQTT_CLIENT_ID` | `api-g3` | Client ID fixe (contrat §2) |
| `MQTT_CA_FILE` | vide | CA locale (`/certs/ca.crt` dans Docker). Obligatoire en `mqtts://` (sinon refus de démarrer), ignorée en `mqtt://` |
| `DATABASE_URL` | — | Connexion PostgreSQL |
| `INGEST_TOKEN` | — | Jeton du script IA, 32 caractères min. |
| `OPERATOR_TOKEN` | — | Jeton du dashboard, 32 caractères min. |
| `ALLOWED_ORIGINS` | vide | Origines autorisées (WebSocket, et CORS en dev), séparées par `,` |
| `OFFLINE_TIMEOUT_S` | `10` | Délai sans message avant passage `offline` |
| `RATE_LIMIT_PER_MIN` | `120` | Limite globale par IP |
| `CMD_RATE_LIMIT_PER_MIN` | `20` | Limite sur `POST /commands` |
| `TRUST_PROXY` | vide | IP du reverse proxy HTTPS, seule autorisée à fixer l'IP client (`X-Forwarded-For`) pour le rate limiting |
| `DASHBOARD_DIR` | `public` | Dossier du dashboard exporté, servi sur `/` |

## Sécurité : ce que fait l'API, ce qu'elle ne fait pas

Côté API : validation stricte de **toute** entrée (HTTP et MQTT, champs inconnus rejetés,
plages vérifiées), jetons Bearer comparés en temps constant sur empreinte SHA-256, rate
limiting par IP, corps limités à 4 Ko, messages MQTT limités à 512 octets, requêtes SQL
paramétrées, aucun secret en dur ni journalisé, erreurs internes jamais détaillées au client,
`x-powered-by` désactivé, WebSocket filtré par `Origin` et plafonné à 20 clients.

TLS ([docs/tls.md](../docs/tls.md)) : en `mqtts://`, l'API vérifie le certificat du broker avec
la CA locale (`rejectUnauthorized: true`, nom contrôlé par le SAN) et ne détient aucune clé privée.
Le HTTPS est terminé par le reverse proxy nginx. L'API ne fait confiance à `X-Forwarded-For` que
lorsque la requête vient de `TRUST_PROXY`.

Côté infrastructure (hors API, à la charge d'INFRA/CYBER) : pare-feu et fermeture du port 1883
en production, comptes et ACL Mosquitto (contrat §2), non-exposition de PostgreSQL sur le
réseau de table (contrat §7).

## Docker

L'image embarque l'API **et** le dashboard (construit dans l'image, étape `dashboard` du
Dockerfile) : le contexte de build est donc la **racine du dépôt**.

```bash
docker build -f api/Dockerfile -t sentinel-api .
```

Image multi-stage (~225 Mo), exécutée en utilisateur `node` (non-root), healthcheck sur `/health`.
Le dashboard est servi sur `/`, même origine que le REST et le WebSocket : pas de CORS en
production. Fichiers exclus du contexte : `api/Dockerfile.dockerignore`.

Stack complète comme en production (broker + base + API/dashboard, MQTTS), depuis la racine :

```bash
./scripts/generate-certs.sh                                              # une fois
docker compose -f dev/docker-compose.yml --profile full up -d --build
docker compose -f dev/docker-compose.yml --profile full --profile https up -d   # + HTTPS :443
```

Le conteneur reçoit uniquement la CA publique (`certs/public` monté en `/certs:ro`).

Dans `docker-compose.yml` (INFRA) :

```yaml
api:
  build: { context: ., dockerfile: api/Dockerfile }
```

## Architecture du code

```
src/
  index.ts            câblage : config → base → temps réel → MQTT → HTTP
  config.ts           variables d'environnement validées (zod)
  contract.ts         types, schémas stricts et topics issus du contrat
  errors.ts           ApiError et codes du contrat §4.4
  db/                 pool, migration, un dépôt par table (SQL paramétré)
  mqtt/bridge.ts      connexion unique, abonnements, publication des commandes
  realtime/hub.ts     serveur WebSocket (authentification, diffusion)
  http/               app Express, middlewares, routes (une par ressource)
  services/           logique métier : ingestion, alertes, état, commandes, watchdog
test/                 tests node:test, doublures en mémoire pour base et broker
```

Les dépendances sont injectées : les routes et les services se testent sans base ni broker.

## Procédure de test manuelle

Avec le simulateur en lieu et place du boîtier (`cd simulator && npm start`) :

```bash
OP=<OPERATOR_TOKEN>
curl http://localhost:8080/health
curl -H "Authorization: Bearer $OP" http://localhost:8080/api/v1/status
curl -H "Authorization: Bearer $OP" "http://localhost:8080/api/v1/telemetry?limit=5"
curl -X POST -H "Authorization: Bearer $OP" -H "Content-Type: application/json" \
  -d '{"action":"BUZZER","state":"ON","duration_ms":3000}' \
  http://localhost:8080/api/v1/commands
```

Le simulateur doit afficher `🔔 Buzzer ON (3000 ms)`, et le dashboard (ou un client
WebSocket) recevoir l'`ack`. Tuer brutalement le simulateur doit faire apparaître, en moins
de 10 s, l'état `offline` et une alerte `SYSTEM`/`OFFLINE`.
