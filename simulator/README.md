# Simulateur SX-003

Faux ESP8266 : publie la télémétrie (2 s), le statut (10 s) et les alertes sur `sentinel/g3/*`,
et répond aux commandes (`cmd` → `ack`), exactement comme le boîtier (cf. [contrat](../docs/contrat.md)).

> ⚠️ Ne jamais le lancer en même temps que le vrai ESP : ils publient sur les mêmes topics.

## Lancement

```bash
# 1. Broker de dev (une seule fois, depuis la racine du dépôt)
cp dev/.env.example dev/.env
docker compose -f dev/docker-compose.yml up -d

# 2. Simulateur
cd simulator
cp .env.example .env
npm install
npm start
```

## Scénarios (touches pendant l'exécution)

| Touche | Effet |
|--------|-------|
| `g` | Fuite de gaz : montée vers 850 → alertes `WARNING` puis `CRITICAL` |
| `i` | Intrus : distance → 40 cm → alerte `MOTION` |
| `h` | Échauffement lent : temp. + gaz dérivent sous les seuils (pour l'IA prédictive) |
| `n` | Retour à la normale |
| `x` | Envoie un message hors contrat (test de validation de l'API) |
| `q` | Crash brutal → le broker publie le LWT `offline` |
| `Ctrl+C` | Arrêt propre → publie `offline` |

## Observer le trafic

Sans client MQTT installé, via le conteneur :

```bash
docker exec -it sx-mosquitto-dev mosquitto_sub -u monitor -P change-me-monitor -t "sentinel/g3/#" -v
```

Envoyer une commande (comme le fera l'API) :

```bash
docker exec sx-mosquitto-dev mosquitto_pub -u api -P change-me-api -t sentinel/g3/cmd -q 1 \
  -m '{"id":"c-1","action":"BUZZER","state":"ON","duration_ms":3000}'
```

## Comptes MQTT de dev

Définis dans `dev/.env`, droits dans `dev/mosquitto/acl` (conformes au contrat §2) :
`esp` (simulateur / ESP), `api`, `ai`, et `monitor` (lecture seule de tout, **dev uniquement**).
