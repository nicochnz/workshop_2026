# Sentinel-X — Groupe 3 (Workshop EPSI M1 2026)

Boîtier de surveillance autonome (Edge Node) relié à un PC Serveur Local.
Un ESP8266 mesure température, humidité, gaz et présence (ultrason), et envoie ses mesures en MQTT
au serveur.
Celui-ci stocke tout, détecte les intrus par webcam (YOLO) et les anomalies (maintenance prédictive),
puis affiche le tout en temps réel sur un dashboard qui pilote le buzzer et les LEDs du boîtier.

**Architecture retenue : option B** — le laptop d'un membre de l'équipe est le serveur et le point d'accès Wi-Fi.

> 🚧 Projet en cours de développement. Les sections marquées _à compléter_ le seront au fil du sprint.

---

## Architecture.

```
 ┌──────────────────────── Boîtier SX-003 ───────────────────────────┐
 │ ESP8266 : DHT11 · MQ (gaz) · ultrason · OLED · buzzer · LEDs      │
 └──────────────────────┬────────────────────────────────────────────┘
                        │ Wi-Fi 192.168.10.0/24 — MQTT(S)
 ┌────────────── Laptop serveur (PC Serveur Local) 192.168.10.1 ───┐
 │  Docker Compose                                                 │
 │   ├─ Mosquitto (broker MQTT)        :1883 / :8883               │
 │   ├─ API Node.js + dashboard        :8080  ──► PostgreSQL       │
 │   └─ PostgreSQL                     (réseau interne uniquement) │
 │  Script IA Python (webcam USB + YOLO, Isolation Forest) :5000   │
 └─────────────────────────────────────────────────────────────────┘
                        │ HTTP(S) + WebSocket
                 Navigateur (dashboard)
```

Flux :
1. L'ESP publie `telemetry` (toutes les 2 s), `alerts` et `status` sur Mosquitto.
2. L'API s'abonne, valide, stocke dans PostgreSQL et pousse en WebSocket au dashboard.
3. Le script IA lit `telemetry` (MQTT) et la webcam ; il envoie ses alertes via `POST /api/v1/alerts`.
4. Le dashboard envoie les commandes via `POST /api/v1/commands` ; l'API publie sur `cmd`, l'ESP répond sur `ack`.

Toutes les interfaces (topics, JSON, routes, codes HTTP) sont définies dans **[docs/contrat.md](docs/contrat.md)**.

## Stack

| Brique     | Technologie                                                        |
|------------|--------------------------------------------------------------------|
| Firmware   | C++ / PlatformIO — PubSubClient, ArduinoJson, DHT, SSD1306          |
| API        | Node.js + TypeScript, Express, mqtt.js, zod, ws, pg                 |
| Base       | PostgreSQL                                                         |
| Dashboard  | Next.js (React, export statique) + TypeScript + Tailwind + Chart.js |
| Broker     | Mosquitto                                                          |
| IA         | Python, OpenCV, YOLOv8, scikit-learn                               |

## Structure du dépôt

```
/firmware    projet PlatformIO ESP8266
/api         API Express (MQTT, PostgreSQL, REST, WebSocket) + Dockerfile
/dashboard   dashboard Next.js, exporté en statique et servi par l'API
/simulator   faux ESP8266 pour développer sans matériel
/docs        contrat d'interface, câblage
```

## Prérequis

- Node.js 20+
- Docker + Docker Compose
- VS Code + extension PlatformIO (firmware)
- Un client MQTT pour déboguer : MQTT Explorer ou `mosquitto_pub` / `mosquitto_sub`

## Installation et lancement

_À compléter (étapes 1 à 4)._

## Réseau (option B)

| Appareil       | IP                    |
|----------------|-----------------------|
| Laptop serveur | `192.168.10.1`        |
| ESP8266        | `192.168.10.20`       |
| Postes équipe  | `192.168.10.50 → .60` |

Ports exposés : 8883 (MQTTS), 8080 (API + dashboard), 5000 (flux vidéo IA), 22 (SSH par clé).
Le port 1883 (MQTT en clair) sert uniquement en développement.

## Sécurité

- Aucun secret dans le dépôt : `.env` et `firmware/include/secrets.h` sont ignorés par Git,
  des modèles `.env.example` et `secrets.example.h` sont fournis.
- API : validation stricte (champs inconnus rejetés), jetons Bearer comparés en temps constant,
  rate limiting, corps limités à 4 Ko, requêtes SQL paramétrées.
- MQTT : connexion anonyme interdite, ACL par compte, TLS (MQTTS) en cible finale.

_Détails TLS et hardening : à compléter (étape 5)._

## Documentation

- [Contrat d'interface](docs/contrat.md) — topics MQTT, formats JSON, API REST, WebSocket
- [Câblage](docs/cablage.md) — brochage du boîtier
- [Composants](docs/composants.md) — matériel disponible

## Équipe

| Membre   | Filière       | Responsabilité                              |
|----------|---------------|---------------------------------------------|
| Nicolas  | EISI DEV      | Firmware, API, dashboard, contrôle réactif  |
| Baptiste | _à compléter_ |                                             |
| Raphael  | _à compléter_ |                                             |
| Baptiste | _à compléter_ |                                             |
