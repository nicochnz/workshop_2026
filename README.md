# Sentinel-X — Groupe 3 (Workshop EPSI M1 2026)

Boîtier de surveillance autonome (Edge Node) relié à un PC Serveur Local.
Un ESP8266 mesure température, humidité, gaz et présence (ultrason) et envoie ses mesures en MQTT
au serveur. Celui-ci les stocke, détecte les intrus par webcam (YOLO) et les anomalies (maintenance
prédictive), puis affiche tout en temps réel sur un dashboard qui pilote le buzzer et les LEDs du boîtier.

**Architecture retenue : option B** — le laptop d'un membre de l'équipe est le serveur et le point
d'accès Wi-Fi.

---

## État d'avancement

| Brique | État | Détails |
|---|---|---|
| Contrat d'interface | ✅ v1.2 | [docs/contrat.md](docs/contrat.md) : topics MQTT, JSON, REST, WebSocket |
| Simulateur (faux ESP) | ✅ | Télémétrie, alertes, statut, commandes, scénarios au clavier |
| API + PostgreSQL | ✅ | REST, WebSocket, ingestion MQTT, 73 tests |
| Dashboard | ✅ | Courbes live, état, alertes, commandes, vidéo IA, bandeaux d'alerte |
| Image Docker API + dashboard | ✅ | Le dashboard est construit dans l'image et servi par l'API |
| Firmware ESP8266 | 🟡 | Compile ; test sur carte et câblage des capteurs à faire |
| Scripts IA (vision + prédictif) | ⏳ | Équipe IA : `POST /api/v1/alerts` + flux MJPEG `:5000/video_feed` |
| Docker Compose final + Wi-Fi de table | ⏳ | Équipe INFRA |
| TLS (MQTTS 8883, HTTPS 443) | 🟡 | CA locale ECDSA, broker + API + simulateur en MQTTS, HTTPS/WSS via nginx ; ESP à passer en TLS — [docs/tls.md](docs/tls.md) |

---

## Architecture

```
 ┌──────────────────────── Boîtier SX-003 ───────────────────────────┐
 │ ESP8266 : DHT11 · MQ (gaz) · ultrason · OLED · buzzer · LEDs      │
 └──────────────────────┬────────────────────────────────────────────┘
                        │ Wi-Fi 192.168.10.0/24 — MQTT(S)
 ┌────────────── Laptop serveur (PC Serveur Local) 192.168.10.1 ───┐
 │  Docker Compose                                                 │
 │   ├─ Mosquitto (broker MQTT)        :8883 TLS (+ :1883 secours) │
 │   ├─ nginx (HTTPS, WSS, vidéo IA)   :443                        │
 │   ├─ API Node.js + dashboard        :8080  ──► PostgreSQL       │
 │   └─ PostgreSQL                     (réseau interne uniquement) │
 │  Script IA Python (webcam USB + YOLO, Isolation Forest) :5000   │
 └─────────────────────────────────────────────────────────────────┘
                        │ HTTP(S) + WebSocket
                 Navigateur (dashboard)
```

Flux :
1. L'ESP (ou le simulateur) publie `telemetry` toutes les 2 s, `alerts` sur événement et `status`
   toutes les 10 s. En cas de coupure brutale, le broker publie `offline` à sa place (LWT).
2. L'API s'abonne, valide chaque message, le stocke dans PostgreSQL et le pousse au dashboard
   par WebSocket.
3. Le script IA lit `telemetry` (MQTT) et la webcam, puis envoie ses alertes via `POST /api/v1/alerts`.
4. Le dashboard envoie les commandes via `POST /api/v1/commands` ; l'API publie sur `cmd`,
   le boîtier exécute et confirme sur `ack`, et le dashboard affiche « Commande exécutée ».

Toutes les interfaces sont définies dans **[docs/contrat.md](docs/contrat.md)** : c'est la référence
de toute l'équipe.

## Stack

| Brique     | Technologie                                                          |
|------------|----------------------------------------------------------------------|
| Firmware   | C++ / PlatformIO — 256dpi/MQTT, ArduinoJson 7, DHT, SSD1306           |
| API        | Node.js 20 + TypeScript, Express 5, mqtt.js, zod, ws, pg              |
| Base       | PostgreSQL 16                                                        |
| Dashboard  | Next.js 16 (export statique) + React 19 + TypeScript + Tailwind 4 + Chart.js |
| Broker     | Mosquitto 2                                                          |
| Simulateur | Node.js + TypeScript, mqtt.js                                        |
| IA         | Python, OpenCV, YOLOv8, scikit-learn                                 |

## Structure du dépôt

```
/api         API Express (MQTT, PostgreSQL, REST, WebSocket) + Dockerfile (embarque le dashboard)
/dashboard   dashboard Next.js, exporté en statique et servi par l'API
/firmware    projet PlatformIO ESP8266
/simulator   faux ESP8266 pour développer sans matériel
/dev         stack Docker : Mosquitto, PostgreSQL, API, reverse proxy HTTPS (docker compose)
/scripts     generate-certs.sh : CA locale et certificats TLS (sortie dans certs/, ignoré par Git)
/docs        contrat d'interface, câblage, composants
```

## Prérequis

- Node.js 20.9+
- Docker Desktop (Docker Compose v2)
- VS Code + extension PlatformIO IDE (firmware uniquement)

---

## Démarrage rapide : tout le système en 5 minutes, sans matériel

Toutes les commandes partent de la **racine du dépôt**.

**1. Configurer les secrets** (fichiers ignorés par Git) :

```bash
cp dev/.env.example dev/.env
cp api/.env.example api/.env
cp simulator/.env.example simulator/.env
```

Dans `api/.env`, remplacer `INGEST_TOKEN` et `OPERATOR_TOKEN` par des valeurs aléatoires :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Générer la CA locale et les certificats TLS (Git Bash sous Windows, une seule fois) :

```bash
./scripts/generate-certs.sh
```

**2. Lancer broker + base + API/dashboard** (comme en production, API ↔ broker en MQTTS) :

```bash
docker compose -f dev/docker-compose.yml --profile full up -d --build
```

Avec HTTPS (reverse proxy nginx sur 443) : ajouter `--profile https` et ouvrir
`https://localhost` après avoir importé `certs/public/ca.crt` (voir [docs/tls.md](docs/tls.md) §5).

Le premier build prend quelques minutes (il construit l'API et le dashboard).

**3. Lancer le faux boîtier** :

```bash
cd simulator && npm install && npm start
```

**4. Ouvrir http://localhost:8080** et saisir l'`OPERATOR_TOKEN` de `api/.env`.

Le voyant passe **EN LIGNE**, les courbes avancent toutes les 2 s.

**5. Jouer les scénarios** dans le terminal du simulateur :

| Touche | Effet visible sur le dashboard |
|---|---|
| `g` | Fuite de gaz : courbe qui monte, badge ▲ Alerte puis ⬢ Critique, **bandeau rouge pulsant** |
| `i` | Intrus : la distance chute, badge ▲ Présence, alerte « Présence » |
| `h` | Échauffement lent (temp. + gaz) sous les seuils : cas d'école pour l'IA prédictive |
| `n` | Retour à la normale |
| `x` | Envoi d'un message hors contrat : l'API le rejette, rien ne s'affiche |
| `q` | Crash du boîtier : voyant **HORS LIGNE** + bandeau en ~10 s |

Les boutons du panneau **Commandes** (buzzer, LEDs, SILENCE) s'affichent dans le terminal du
simulateur (🔔, 🔴, 🟢) et le dashboard confirme « ✓ Commande exécutée ».

**Arrêter** : `Ctrl+C` dans le simulateur, puis
`docker compose -f dev/docker-compose.yml --profile full down` (les données sont conservées).

---

## Développer une brique

Pour modifier le code avec rechargement instantané, on lance l'API et le dashboard hors Docker.
Seuls le broker et la base restent en conteneurs.

```bash
docker compose -f dev/docker-compose.yml --profile full stop api   # si la stack complète tourne
docker compose -f dev/docker-compose.yml up -d                      # Mosquitto (8883 TLS + 1883) + PostgreSQL (55432)
```

| Brique | Commandes | Adresse | Doc |
|---|---|---|---|
| API | `cd api && npm install && npm run dev` | http://localhost:8080 | [api/README.md](api/README.md) |
| Dashboard | `cd dashboard && cp .env.example .env.local && npm install && npm run dev` | http://localhost:3100 | [dashboard/README.md](dashboard/README.md) |
| Simulateur | `cd simulator && npm start` | — | [simulator/README.md](simulator/README.md) |
| Firmware | PlatformIO : compiler, téléverser, moniteur série | — | [firmware/README.md](firmware/README.md) |

Vérifications : `npm run typecheck`, `npm run lint` (dashboard) et `npm test` (API).

### Observer le trafic MQTT

```bash
docker exec -it sx-mosquitto-dev mosquitto_sub -u monitor -P change-me-monitor -t "sentinel/g3/#" -v
```

### Ports de développement

| Port | Service |
|---|---|
| 8883 | Mosquitto MQTTS |
| 1883 | Mosquitto en clair (fallback temporaire) |
| 443 / 80 | Dashboard en HTTPS via nginx (80 redirige vers 443), profil `https` |
| 55432 | PostgreSQL de dev (évite le conflit avec un PostgreSQL local) |
| 8080 | API + dashboard |
| 3100 | Dashboard en mode dev (`next dev`) |

---

## Le dashboard en bref

- **Accès** : saisie du jeton opérateur, vérifié auprès de l'API puis gardé le temps de l'onglet.
- **État du boîtier** : en ligne / hors ligne, IP, signal Wi-Fi, durée de service, firmware,
  ancienneté de la dernière mesure.
- **Mesures en direct** : 4 courbes (température, humidité, gaz, distance) sur 5 min, avec les
  seuils d'alerte en pointillés.
- **Alertes** : historique de toutes les sources (boîtier, IA vision, IA prédictive, système).
- **Commandes** : buzzer (1 à 10 s), LED rouge, LED verte, **SILENCE**. Chaque commande suit son
  cycle : envoyée, exécutée, refusée ou sans réponse.
- **Vision IA** : flux webcam annoté par l'IA, avec un message et « Réessayer » si le flux est absent.
- **Démo** : bandeau pulsant pour l'alerte critique (« Acquitter »), bandeau hors ligne, titre
  d'onglet « ⚠ ALERTE », reconnexion automatique du temps réel, texte agrandi sur vidéoprojecteur.
- **Thème néon** sur la palette de l'équipe, contrastes vérifiés (WCAG) et curseur main sur tout
  ce qui est cliquable.

## Dépannage

| Symptôme | Cause et solution |
|---|---|
| Le dashboard affiche une ancienne version | Onglet ouvert avant le dernier build : **Ctrl+F5** |
| Simulateur : « Reconnexion au broker… » en boucle | Deux clients avec le même client ID (deux simulateurs, ou simulateur + ESP) : n'en garder qu'un |
| Port 8080 ou 3000 déjà utilisé | Un autre projet tourne : `docker ps`, puis arrêter le conteneur concerné |
| « Jeton refusé par l'API » | Copier l'`OPERATOR_TOKEN` exact de `api/.env` ; après un changement, relancer l'API |
| Erreur CORS en dev sur :3100 | L'API doit tourner avec `NODE_ENV=development` et `ALLOWED_ORIGINS` contenant `http://localhost:3100` |
| « Flux vidéo indisponible » | Normal tant que le script IA ne diffuse pas sur le port 5000 |
| L'ESP ne joint pas le broker | Pare-feu Windows : ouvrir le port 1883 (ou 8883) entrant (voir [firmware/README.md](firmware/README.md)) |
| API : « CA MQTT illisible » ou « MQTT_CA_FILE est vide » | Lancer `./scripts/generate-certs.sh`, ou passer en fallback `API_MQTT_URL=mqtt://mosquitto:1883` ([docs/tls.md](docs/tls.md) §6) |
| Alerte de certificat dans le navigateur | Importer `certs/public/ca.crt` comme autorité racine ([docs/tls.md](docs/tls.md) §5) |
| Problème TLS juste avant la démo | Fallback en clair, une variable à changer : [docs/tls.md](docs/tls.md) §6 |

---

## Réseau (option B)

| Appareil       | IP                    |
|----------------|-----------------------|
| Laptop serveur | `192.168.10.1`        |
| ESP8266        | `192.168.10.20`       |
| Postes équipe  | `192.168.10.50 → .60` |

Ports exposés : 8883 (MQTTS), 443 (dashboard HTTPS), 8080 (API + dashboard en HTTP, fallback),
5000 (flux vidéo IA), 22 (SSH par clé). Le port 1883 (MQTT en clair) reste ouvert en fallback
temporaire, puis est fermé en phase 3 ([docs/tls.md](docs/tls.md) §7).

## Sécurité

- Aucun secret dans le dépôt : `.env`, `.env.local` et `firmware/include/secrets.h` sont ignorés
  par Git. Des modèles `.env.example` et `secrets.example.h` sont fournis.
- API : validation stricte de toute entrée (champs inconnus rejetés), jetons Bearer comparés en temps
  constant, rate limiting, corps limités à 4 Ko, requêtes SQL paramétrées, WebSocket filtré par origine.
- Dashboard : aucun jeton dans le code, jeton en `sessionStorage`, servi à la même origine que l'API
  (pas de CORS en production).
- Image Docker : multi-stage, utilisateur non-root, healthcheck.
- MQTT : connexion anonyme interdite, un compte et des ACL par client, MQTTS (TLS 1.2+) avec
  vérification du certificat par la CA locale.
- TLS : CA locale ECDSA P-256, clés privées jamais commitées ni montées dans l'API, HTTPS/WSS
  et flux vidéo servis à la même origine par nginx. Détails : [docs/tls.md](docs/tls.md).

## Documentation

- [Contrat d'interface](docs/contrat.md) — topics MQTT, formats JSON, API REST, WebSocket
- [TLS](docs/tls.md) — certificats, MQTTS, HTTPS, ESP8266 et heure, fallback démo
- [API](api/README.md) — routes, WebSocket, variables d'environnement, Docker
- [Dashboard](dashboard/README.md) — thème, accessibilité, structure, build statique
- [Simulateur](simulator/README.md) — scénarios, commandes de test
- [Firmware](firmware/README.md) — flash, tests, calibration
- [Câblage](docs/cablage.md) — brochage du boîtier
- [Composants](docs/composants.md) — matériel disponible

## Équipe

| Membre   | Filière       | Responsabilité                                               |
|----------|---------------|--------------------------------------------------------------|
| Nicolas  | EISI DEV      | Contrat, simulateur, firmware, dashboard, contrôle réactif    |
| Baptiste | _à compléter_ | _à compléter_                                                |
| Raphael  | _à compléter_ | _à compléter_                                                |
| Baptiste | _à compléter_ | _à compléter_                                                |
