# Sentinel-X — Groupe 3 (Workshop EPSI M1 2026)

Sentinel-X est un **boîtier de surveillance** pour site industriel isolé. Il mesure la température,
l'humidité, le gaz et la présence, et envoie ses mesures sans fil à un **serveur local**.
Le serveur enregistre tout, repère les intrus grâce à une webcam (IA) et affiche l'ensemble en
temps réel sur un **tableau de bord web**, d'où l'on peut déclencher l'alarme du boîtier à distance.

**Architecture retenue : option B** — le serveur est le laptop d'un membre de l'équipe, qui sert
aussi de point d'accès Wi-Fi.

---

## Où en est le projet

| Brique | État | Responsable |
|---|---|---|
| Contrat d'interface (règles communes) | ✅ | Nicolas |
| Simulateur (faux boîtier pour tester sans matériel) | ✅ | Nicolas |
| API + base de données | ✅ | Thomas |
| Tableau de bord (dashboard) | ✅ | Nicolas, Raphael |
| Chiffrement TLS (MQTTS, HTTPS) | ✅ serveur · ⏳ boîtier | Thomas · Nicolas |
| Firmware du boîtier (ESP8266) | 🟡 en test sur la plaquette | Nicolas, Baptiste |
| Scripts IA (webcam + prédiction) | ⏳ | Équipe IA |
| Wi-Fi de table et laptop serveur final | ⏳ | Équipe INFRA |

Ce qu'il reste à faire est détaillé dans [Reste à faire](#reste-à-faire).

---

## Comment ça marche

```
 ┌──────────────── Boîtier SX-003 ─────────────────┐
 │ ESP8266 + capteurs (temp., humidité, gaz,      │
 │ distance) + écran OLED + buzzer + LEDs         │
 └───────────────────────┬─────────────────────────┘
                         │ Wi-Fi, messages MQTT chiffrés (port 8883)
 ┌──────────── Laptop serveur 192.168.10.1 ────────────────────────┐
 │  Mosquitto    reçoit et distribue les messages du boîtier       │
 │  API          vérifie, enregistre (PostgreSQL), diffuse en live │
 │  nginx        sert le dashboard en HTTPS (port 443)             │
 │  Script IA    analyse la webcam et les mesures                  │
 └───────────────────────┬─────────────────────────────────────────┘
                         │ HTTPS
                 Navigateur : dashboard
```

En quelques mots :

1. Le boîtier envoie ses **mesures toutes les 2 s**, ses **alertes** (gaz, présence) et son
   **état** (en ligne / hors ligne).
2. L'**API** contrôle chaque message, l'enregistre et le transmet **instantanément** au dashboard.
3. L'**IA** surveille la webcam et les courbes, et signale les intrus ou les anomalies à l'API.
4. Depuis le dashboard, un clic sur « Buzzer » envoie un **ordre au boîtier**, qui confirme
   l'avoir exécuté.

Tous ces échanges suivent des règles communes, écrites dans le
**[contrat d'interface](docs/contrat.md)** : c'est la référence de toute l'équipe.

### Technologies

| Brique | Technologies |
|---|---|
| Boîtier | ESP8266, C++ (PlatformIO) |
| Messages | MQTT avec le broker Mosquitto |
| API | Node.js, TypeScript, Express, PostgreSQL |
| Dashboard | Next.js (React), Tailwind CSS, Chart.js |
| Sécurité | TLS : certificats générés localement, nginx pour le HTTPS |
| IA | Python, OpenCV, YOLOv8, scikit-learn |
| Déploiement | Docker Compose |

### Organisation du dépôt

```
api/         l'API (et son image Docker, qui contient aussi le dashboard)
dashboard/   le tableau de bord web
firmware/    le programme du boîtier ESP8266
simulator/   le faux boîtier, pour tester sans matériel
dev/         la configuration Docker (broker, base, API, HTTPS)
scripts/     generate-certs.sh : crée les certificats de chiffrement
docs/        contrat d'interface, TLS, câblage, liste du matériel
```

---

## Lancer le projet (sans matériel, ~5 minutes)

**Prérequis :** Node.js 20.9 ou plus, Docker Desktop, et Git Bash sous Windows.
Toutes les commandes se lancent depuis la **racine du dépôt**.

### 1. Créer les fichiers de configuration

Ils contiennent les mots de passe et ne sont **jamais envoyés sur GitHub**.

```bash
cp dev/.env.example dev/.env
cp api/.env.example api/.env
cp simulator/.env.example simulator/.env
```

Dans `api/.env`, remplacer les deux jetons d'accès `INGEST_TOKEN` et `OPERATOR_TOKEN` par des
valeurs aléatoires, générées avec :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> Après un `git pull`, si un fichier `.env.example` a changé, recopier le `.env` correspondant.

### 2. Créer les certificats de chiffrement (une seule fois)

```bash
./scripts/generate-certs.sh
```

Ils sont rangés dans `certs/`, qui n'est jamais envoyé sur GitHub.

### 3. Démarrer le serveur

```bash
docker compose -f dev/docker-compose.yml --profile full --profile https up -d --build
```

Le premier lancement prend quelques minutes.

### 4. Démarrer le faux boîtier

```bash
cd simulator
npm install
npm start
```

### 5. Ouvrir le dashboard

- **https://localhost** (chiffré). Pour éviter l'alerte de sécurité du navigateur, déclarer une
  fois notre certificat comme fiable :
  `certutil -addstore -user Root certs/public/ca.crt` (Windows), puis redémarrer le navigateur.
- ou **http://localhost:8080** (non chiffré, solution de secours).

Se connecter avec l'`OPERATOR_TOKEN` de `api/.env`. Le voyant passe **EN LIGNE** et les courbes
avancent toutes les 2 s.

### 6. Tester les scénarios

Dans le terminal du simulateur, appuyer sur une touche :

| Touche | Ce qui se passe sur le dashboard |
|---|---|
| `g` | **Fuite de gaz** : la courbe monte, puis un bandeau rouge d'alerte critique apparaît |
| `i` | **Intrus** : la distance chute, une alerte « Présence » apparaît |
| `h` | **Échauffement lent** : dérive progressive, utile pour tester l'IA prédictive |
| `n` | Retour à la normale |
| `q` | **Panne du boîtier** : il passe « HORS LIGNE » en ~10 s |

Les boutons **Buzzer**, **LED** et **Silence** du dashboard s'affichent dans le terminal du
simulateur, et le dashboard confirme « Commande exécutée ».

**Tout arrêter :** `Ctrl+C` dans le simulateur, puis
`docker compose -f dev/docker-compose.yml --profile full --profile https down`.
Les données sont conservées.

---

## Le jour de la démo

- Le **vrai boîtier** remplace le simulateur. Il ne faut **jamais lancer les deux en même temps** :
  ils utilisent la même identité et se déconnectent l'un l'autre.
- Mode visé : tout chiffré (boîtier en MQTTS, dashboard en HTTPS).
- **Plan B :** chaque brique peut repasser en non chiffré en changeant un seul réglage
  ([docs/tls.md](docs/tls.md) §6). Si le boîtier tombe en panne, le simulateur prend le relais,
  en le **disant clairement** au jury.

---

## Développer

Pour modifier le code avec rechargement automatique, on garde le broker et la base dans Docker
et on lance la brique concernée à la main.

```bash
docker compose -f dev/docker-compose.yml --profile full stop api   # libère le port 8080
docker compose -f dev/docker-compose.yml up -d                      # broker + base
```

| Brique | Commande | Adresse | Documentation |
|---|---|---|---|
| API | `cd api && npm install && npm run dev` | http://localhost:8080 | [api/README.md](api/README.md) |
| Dashboard | `cd dashboard && cp .env.example .env.local && npm install && npm run dev` | http://localhost:3100 | [dashboard/README.md](dashboard/README.md) |
| Simulateur | `cd simulator && npm start` | — | [simulator/README.md](simulator/README.md) |
| Firmware | PlatformIO dans VS Code | — | [firmware/README.md](firmware/README.md) |

Vérifier son code avant un commit : `npm run typecheck` partout, `npm run lint` (dashboard),
`npm test` (API).

Voir passer tous les messages MQTT :

```bash
docker exec -it sx-mosquitto-dev mosquitto_sub -u monitor -P change-me-monitor -t "sentinel/g3/#" -v
```

---

## Sécurité

Le système sera attaqué par les autres groupes (pentest du jeudi). Les protections en place :

- **Rien de secret sur GitHub** : mots de passe, jetons et certificats restent sur les postes.
- **Tout est chiffré** : messages MQTT en TLS (port 8883), dashboard en HTTPS (port 443).
  Le boîtier et l'API vérifient l'identité du serveur, ce qui bloque l'espionnage du réseau
  (attaque « homme du milieu »).
- **Accès contrôlés** : chaque appareil a son compte MQTT avec des droits limités, et l'API exige
  un jeton.
- **Entrées vérifiées** : tout message mal formé ou inattendu est rejeté (protection contre les
  injections). Le nombre et la taille des requêtes sont limités (protection contre la saturation).
- **Conteneurs durcis** : l'API tourne sans droits administrateur, et la base n'est pas joignable
  depuis le réseau.

Détails du chiffrement : [docs/tls.md](docs/tls.md).

---

## Réseau

| Appareil | Adresse IP |
|---|---|
| Laptop serveur | `192.168.10.1` |
| Boîtier ESP8266 | `192.168.10.20` |
| Postes de l'équipe | `192.168.10.50` à `.60` |

| Port | Usage |
|---|---|
| 8883 | Messages MQTT chiffrés (boîtier, IA) |
| 443 | Dashboard en HTTPS (80 redirige vers 443) |
| 8080 | Dashboard non chiffré (secours) |
| 5000 | Vidéo de l'IA |
| 1883 | Messages MQTT non chiffrés (secours, à fermer une fois le TLS validé) |
| 55432 | Base de données de développement (sur le poste uniquement) |
| 3100 | Dashboard en mode développement |

---

## Dépannage

| Problème | Solution |
|---|---|
| Le dashboard affiche une ancienne version | Recharger sans cache : **Ctrl+F5** |
| Le simulateur affiche « Reconnexion au broker… » en boucle | Deux faux boîtiers (ou simulateur + vrai boîtier) tournent en même temps : n'en garder qu'un |
| « Jeton refusé par l'API » | Copier exactement l'`OPERATOR_TOKEN` de `api/.env` |
| Alerte de sécurité dans le navigateur | Déclarer le certificat comme fiable (étape 5), ou passer par http://localhost:8080 |
| L'API ou le simulateur ne démarre pas : « CA MQTT illisible » | Lancer `./scripts/generate-certs.sh` |
| Un port est déjà utilisé (8080, 443…) | Un autre logiciel l'occupe : `docker ps` pour le trouver et l'arrêter |
| « Flux vidéo indisponible » | Normal tant que le script IA ne tourne pas |
| Le boîtier ne se connecte pas au serveur | Ouvrir les ports dans le pare-feu Windows (voir [firmware/README.md](firmware/README.md)) |

---

## Reste à faire

| Tâche | Qui |
|---|---|
| Tester le firmware sur la plaquette, puis calibrer les seuils (gaz, présence) | Baptiste, Nicolas |
| Passer le boîtier en MQTTS (certificat + réglage de l'heure) | Nicolas |
| Fournir l'heure au boîtier sans Internet (serveur NTP local) | Thomas / INFRA |
| Brancher les scripts IA (alertes + vidéo) | Équipe IA |
| Mettre en place le Wi-Fi de table sur le laptop serveur | Équipe INFRA |
| Fermer les ports de secours (1883, 8080, 5000) une fois tout validé en TLS | Thomas |
| Auto-test de sécurité avant le pentest de jeudi | Toute l'équipe |
| Scénario de démo minuté et plan B | Toute l'équipe |

---

## Documentation détaillée

- [Contrat d'interface](docs/contrat.md) — messages MQTT, API, temps réel
- [TLS](docs/tls.md) — certificats, chiffrement, heure du boîtier, plan B
- [API](api/README.md) — routes, variables, Docker
- [Dashboard](dashboard/README.md) — thème, accessibilité, structure
- [Simulateur](simulator/README.md) — scénarios, tests
- [Firmware](firmware/README.md) — installation, flash, tests sur carte
- [Câblage](docs/cablage.md) — branchement des composants
- [Composants](docs/composants.md) — matériel disponible

## Équipe

| Membre | Rôle |
|---|---|
| Nicolas | Contrat d'interface, simulateur, firmware, dashboard |
| Raphael | Intégration, dashboard |
| Thomas | API, tests, chiffrement TLS |
| Baptiste | Câblage du boîtier, tests du firmware |
