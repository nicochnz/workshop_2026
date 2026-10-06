# TLS — MQTTS et HTTPS (Sentinel-X, groupe 3)

Référence unique pour les certificats, MQTTS (8883), HTTPS (443) et le retour au clair en cas
de problème le jour de la démo. Les topics, formats et routes restent ceux de
[contrat.md](contrat.md).

```
ESP8266 ──MQTTS 8883──┐
IA (paho) ─MQTTS 8883─┤
                      ▼
                  Mosquitto ◄──MQTTS (réseau Docker, nom « mosquitto »)── API ──► PostgreSQL
                                                                           ▲
Navigateur ──HTTPS/WSS 443──► nginx ─┬─ /, /api/v1, /ws ─────── HTTP ──────┘
                                     └─ /video_feed ── HTTP ──► script IA :5000 (hôte)
```

- Un seul certificat d'autorité (CA locale) signe tout : il suffit de distribuer `ca.crt`.
- Algorithme : **ECDSA P-256 / SHA-256** partout (handshake léger pour l'ESP8266, TLS 1.2 minimum).
- Le TLS se termine sur Mosquitto et sur nginx. L'API ne détient **aucune clé privée** :
  elle reçoit uniquement `ca.crt`, pour vérifier le broker.

---

## 1. Générer les certificats

Sur le laptop serveur (192.168.10.1), depuis la racine du dépôt (Git Bash sous Windows,
n'importe quel shell sous Linux) :

```bash
./scripts/generate-certs.sh
```

- La CA est créée **une seule fois** puis conservée. Relancer le script ne régénère que les
  certificats serveur : le `ca.crt` déjà flashé dans l'ESP reste valable.
- `./scripts/generate-certs.sh --renew-ca` crée une nouvelle CA. Il faut alors redistribuer
  `ca.crt` (firmware, IA, navigateurs).
- `EXTRA_SAN="IP:192.168.1.42" ./scripts/generate-certs.sh` ajoute une adresse au SAN, par
  exemple l'IP du PC de dev quand on teste l'ESP sur un autre réseau.
- **Générer les certificats sur une machine à l'heure** : leur début de validité est l'heure de
  génération (voir §5).

| Fichier | Contenu | Monté dans |
|---|---|---|
| `certs/ca/ca.key` | clé privée de la CA | **nulle part** : ne quitte jamais le serveur |
| `certs/ca/ca.crt` | certificat de la CA | — (original) |
| `certs/mosquitto/{ca.crt,mosquitto.crt,mosquitto.key}` | certificat du broker | Mosquitto, `/certs` (`:ro`) |
| `certs/proxy/{proxy.crt,proxy.key}` | certificat HTTPS | nginx, `/etc/nginx/certs` (`:ro`) |
| `certs/public/ca.crt` | CA publique | API (`/certs/ca.crt`, `:ro`), ESP, IA, simulateur, navigateurs |

**SAN des certificats serveur** :
`IP:192.168.10.1, DNS:192.168.10.1, DNS:mosquitto, DNS:localhost, IP:127.0.0.1`.

- `IP:192.168.10.1` : validation standard par IP (Node, OpenSSL, navigateurs).
- `DNS:192.168.10.1` : l'ESP passe `MQTT_HOST` sous forme de chaîne, et BearSSL ne compare
  ce nom qu'aux entrées `dNSName` du SAN (pas de prise en charge des SAN `iPAddress`).
- `DNS:mosquitto` : l'API joint le broker par son nom de service Docker.
- `localhost` / `127.0.0.1` : tests sur le poste qui héberge la stack.

Validité : CA 10 ans, certificats serveur 365 jours.

`certs/` et les extensions `*.key`, `*.crt`, `*.pem`, `*.csr`, `*.srl` sont ignorés par Git :
aucun certificat ni clé n'est commité. Vérification : `git status --ignored certs` doit afficher
`!! certs/`.

## 2. Mosquitto (MQTTS 8883)

- `dev/mosquitto/mosquitto.conf` : réglages communs (`allow_anonymous false`, mots de passe,
  ACL). Les comptes et les ACL sont **identiques** en clair et en TLS.
- `dev/mosquitto/listeners/tls.conf` : `listener 8883` (`cafile`, `certfile`, `keyfile`,
  `tls_version tlsv1.2`).
- `dev/mosquitto/listeners/plain.conf` : `listener 1883`, **fallback temporaire**.
- `dev/mosquitto/entrypoint.sh` active 8883 dès que `certs/mosquitto/` est rempli (sinon
  avertissement, et le broker démarre en clair seulement). Il recopie les certificats pour
  l'utilisateur `mosquitto`, avec la clé en `0600`.

```bash
docker compose -f dev/docker-compose.yml up -d mosquitto
docker logs sx-mosquitto-dev     # « MQTTS 8883 actif » + « Opening ipv4 listen socket on port 8883 »
```

Test manuel (depuis le conteneur, CA montée en `/certs/ca.crt`) :

```bash
# Git Bash : préfixer par MSYS_NO_PATHCONV=1
docker exec sx-mosquitto-dev mosquitto_sub -h localhost -p 8883 --cafile /certs/ca.crt \
  -u monitor -P <MQTT_MONITOR_PASSWORD> -t "sentinel/g3/#" -v
# Sans notre CA → « Protocol error », et le broker journalise « tlsv1 alert unknown ca »
docker exec sx-mosquitto-dev mosquitto_pub -h localhost -p 8883 --capath /etc/ssl/certs \
  -u esp -P <MQTT_ESP_PASSWORD> -t sentinel/g3/telemetry -m x
```

## 3. API

| Variable | Mode sécurisé (cible) | Fallback démo |
|---|---|---|
| `MQTT_URL` | `mqtts://mosquitto:8883` | `mqtt://mosquitto:1883` |
| `MQTT_CA_FILE` | `/certs/ca.crt` (monté depuis `certs/public`) | ignoré |
| `TRUST_PROXY` | `172.30.10.10` (IP fixe de nginx) | idem |

- En `mqtts://`, le certificat du broker est vérifié avec la CA (`rejectUnauthorized: true`,
  nom vérifié contre le SAN). Sans CA, ou avec une CA illisible, l'API refuse de démarrer
  avec un message explicite. Aucune option ne désactive la vérification.
- En `mqtt://`, la CA est ignorée : la bascule se fait en ne changeant que `MQTT_URL`.
- `TRUST_PROXY` : derrière nginx, toutes les requêtes viennent de l'IP du proxy. L'API ne fait
  confiance à `X-Forwarded-For` que si la requête vient de cette IP, et nginx écrase cet en-tête.
  Le rate limiting reste donc par client réel, et un client ne peut pas usurper une IP.
- Dans Docker Compose, ces valeurs sont fixées par `dev/docker-compose.yml`. Pour l'API lancée
  à la main (`npm run dev`) : `MQTT_URL=mqtts://localhost:8883` et
  `MQTT_CA_FILE=../certs/public/ca.crt` (voir `api/.env.example`).

Contrôle : `docker logs sx-api-dev` doit afficher
`MQTT connecté à mqtts://mosquitto:8883 (client api-g3)`, et le broker
`Client api-g3 negotiated TLSv1.3`.

## 4. ESP8266 (préparation, le firmware n'est pas modifié)

| Élément | Valeur |
|---|---|
| Fichier à intégrer | `certs/public/ca.crt` (PEM, ~700 octets, **public** : ce n'est pas un secret) |
| Broker | `192.168.10.1:8883` (`MQTT_HOST` / `MQTT_PORT` de `secrets.h`) |
| SAN vérifié | `192.168.10.1` (présent en `IP:` et en `DNS:`, voir §1) |
| Clé / courbe | ECDSA P-256, signature ECDSA-SHA256 |
| Protocole | TLS 1.2 (BearSSL ne fait pas TLS 1.3), suite ECDHE-ECDSA-AES-GCM vérifiée |

Intégration côté firmware (à faire par le responsable du firmware) :

```cpp
// secrets.h : contenu exact de certs/public/ca.crt (contrat §8 : CA_CERT)
static const char CA_CERT[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
)EOF";

// network.cpp : remplacer WiFiClient par BearSSL
#include <WiFiClientSecureBearSSL.h>
static BearSSL::WiFiClientSecure net;
static BearSSL::X509List trustAnchor(CA_CERT);
// dans networkBegin() :
net.setTrustAnchors(&trustAnchor);   // vérifie la chaîne ET le nom "192.168.10.1"
```

Garder `mqtt.begin(MQTT_HOST, ...)` avec une chaîne : un `connect(IPAddress)` ne transmet aucun
nom à BearSSL, qui ne vérifierait alors plus que la chaîne.

- **Ne jamais utiliser `setInsecure()`**, qui accepte n'importe quel serveur (MitM au pentest).
- Mémoire : BearSSL réserve environ 16 Ko de tampon de réception. Si
  `net.probeMaxFragmentLength(MQTT_HOST, 8883, 512)` renvoie `true`, appeler
  `net.setBufferSizes(512, 512)`.
- Le handshake ECDSA prend environ 1 s : passer le CPU à 160 MHz
  (`board_build.f_cpu = 160000000L`) et relever `MQTT_TIMEOUT_MS` si les connexions échouent
  par timeout.

### ⚠ L'heure : condition indispensable au TLS sur l'ESP8266

BearSSL vérifie la période de validité du certificat. Au démarrage, l'ESP croit être en 1970 :
**tant que son heure n'est pas réglée, le certificat est « pas encore valide » et la connexion
MQTTS échoue.** Le réseau Sentinel-X n'a pas forcément Internet, donc `pool.ntp.org` peut être
injoignable. Deux solutions :

**Option A (recommandée) — serveur NTP local sur le laptop serveur.** Le firmware interroge déjà
`192.168.10.1` en second serveur NTP (`configTime(0, 0, "pool.ntp.org", MQTT_HOST)` dans
`network.cpp`) : il n'y a rien à changer côté ESP pour l'heure elle-même. Il suffit que le
laptop réponde en NTP (UDP 123) avec sa propre horloge, même sans Internet.

> **État : non intégré, à valider.** La piste privilégiée a été prototypée et testée hors dépôt.

| Solution | OS du laptop | État |
|---|---|---|
| Conteneur chrony (`alpine` + `chrony`, `local stratum 10`, `chronyd -x` : sert l'horloge sans la modifier, aucun privilège) publié sur `123/udp` | indépendant (Docker) | **prototype testé** sous Windows 11 / Docker Desktop : réponse mode serveur, stratum 10, LI 0, heure du laptop |
| Service de temps Windows (`w32time`) en mode serveur NTP (registre `NtpServer Enabled=1`, `AnnounceFlags=5`, droits admin) | Windows | non testé : il faut vérifier qu'il répond avec un stratum non nul hors ligne, sinon l'ESP rejette la réponse |
| chrony installé sur l'hôte (`allow 192.168.10.0/24`, `local stratum 10`) | Linux | non testé |

Dans tous les cas :
- ouvrir **UDP 123 entrant** au pare-feu du laptop ;
- le laptop doit lui-même être à l'heure : le régler avant de couper Internet, ne pas le mettre en
  veille pendant la démo (sous Docker Desktop, l'horloge de la VM WSL2 peut dériver après une
  veille) ;
- le laptop ne doit pas être **avant** la date de génération des certificats.

**Option B — heure de référence dans le firmware.** Si le NTP local n'est pas en place, on
fournit à BearSSL une date minimale, celle de la compilation (`platformio.ini` :
`build_flags = -D BUILD_UNIX_TIME=$UNIX_TIME`), puis
`net.setX509Time(max(time(nullptr), (time_t)BUILD_UNIX_TIME))` avant chaque connexion.
Limites : il faut compiler **après** la génération des certificats, et l'expiration n'est plus
contrôlée par rapport à l'heure réelle.

Dans les deux cas, ne lancer la connexion MQTTS qu'une fois `unixTime() != 0`, ou après avoir
appelé `setX509Time`. Les mesures envoyées avec `ts = 0` restent valides (contrat §1).

## 5. HTTPS du dashboard (nginx, profil `https`)

```bash
docker compose -f dev/docker-compose.yml --profile full --profile https up -d --build
```

- nginx (`dev/proxy/default.conf.template`) écoute sur **443** (TLS 1.2/1.3, certificat
  `certs/proxy`) et redirige 80 vers HTTPS.
- `/`, `/api/v1/*`, `/ws` → API. La page étant en HTTPS, le dashboard ouvre
  **`wss://<hôte>/ws`** : `wsUrl()` dérive le schéma de la page (`https` → `wss`).
- **WebSocket** : l'`Origin` de la page HTTPS doit figurer dans `ALLOWED_ORIGINS`
  (`API_ALLOWED_ORIGINS` dans `dev/.env`, ex. `https://192.168.10.1`), sinon `403`.
- **Flux vidéo IA** : une page HTTPS ne peut pas afficher `http://…:5000/video_feed`
  (Mixed Content bloqué). nginx relaie `/video_feed` vers le script IA sur l'hôte
  (`AI_VIDEO_UPSTREAM`, défaut `http://host.docker.internal:5000`), sans mise en tampon. En HTTPS,
  le dashboard utilise donc `https://<hôte>/video_feed` (même origine). En HTTP, il garde l'accès
  direct au port 5000. Le script IA n'a rien à changer. Si l'IA passe dans Docker Compose,
  il suffit de poser `AI_VIDEO_UPSTREAM=http://<service-ia>:5000` dans `dev/.env`.
- L'API reste joignable en HTTP sur **:8080** pendant la migration (fallback).
- Pas de HSTS : il s'appliquerait aussi à `http://localhost:8080` et casserait le fallback.

**Navigateurs** : importer `certs/public/ca.crt` comme autorité racine sur les postes de
l'équipe et sur le poste de projection. Sinon, le navigateur affiche une alerte de sécurité.
- Windows (Chrome/Edge), sans droits admin : `certutil -addstore -user Root ca.crt`
- Firefox : Paramètres → Certificats → Autorités → Importer
- Linux : `sudo cp ca.crt /usr/local/share/ca-certificates/sentinel-x.crt && sudo update-ca-certificates`

Test : `curl --cacert certs/public/ca.crt https://localhost/health`. Avec le curl de Git Bash
(Schannel), ajouter `--ssl-no-revoke` : la CA locale n'a pas de liste de révocation, et la chaîne
reste vérifiée.

## 6. Fallback démo : revenir au clair

Le mode cible est MQTTS + HTTPS. En cas de problème TLS ou matériel juste avant la soutenance :

| Problème | Bascule |
|---|---|
| L'API n'arrive pas à se connecter au broker en TLS | `API_MQTT_URL=mqtt://mosquitto:1883` dans `dev/.env`, puis `docker compose -f dev/docker-compose.yml --profile full up -d api` |
| L'ESP n'arrive pas à se connecter en TLS (heure, mémoire) | Firmware avec `MQTT_PORT 1883` et `WiFiClient` : le broker accepte toujours 1883 |
| HTTPS / certificat refusé par le navigateur | Utiliser `http://192.168.10.1:8080` (WebSocket `ws://` et vidéo `:5000` automatiques) |
| Certificats perdus | Le broker démarre quand même en 1883 seul (avertissement dans les logs) |

Revenir au mode sécurisé : remettre `API_MQTT_URL=mqtts://mosquitto:8883`, puis relancer la même
commande.

## 7. Migration progressive

| Phase | État | Action |
|---|---|---|
| 1 (actuelle) | 1883 + 8883, HTTP :8080 + HTTPS :443 | — |
| 2 | Validation : ESP, IA et dashboard en TLS | Tests ci-dessus, ESP sur 8883 |
| 3 | TLS seul | `MQTT_PLAIN_LISTENER=off` dans `dev/.env`, retirer `"1883:1883"` (et `"8080:8080"`) des `ports` du Compose, fermer 1883/8080/5000 au pare-feu (le proxy joint l'API par le réseau Docker et l'IA par l'hôte) |

Pare-feu du laptop serveur (ports entrants 8883 et 443 en TCP, plus 123 en UDP si le NTP local
est en place) :
- Windows (PowerShell **administrateur**) :
  `New-NetFirewallRule -DisplayName "Sentinel-X TLS" -Direction Inbound -Protocol TCP -LocalPort 8883,443 -Action Allow`
- Linux : selon le pare-feu en place (ufw, firewalld, nftables).

## 8. Équipe IA (pour mémoire)

- MQTT : `client.tls_set(ca_certs="certs/public/ca.crt")`, puis `client.connect("192.168.10.1", 8883)`.
- REST : `http://192.168.10.1:8080/api/v1` en phase 1, ou
  `https://192.168.10.1/api/v1` avec `verify="certs/public/ca.crt"` (requests).
- Flux vidéo : inchangé (`:5000/video_feed`, en HTTP), relayé en HTTPS par nginx.
