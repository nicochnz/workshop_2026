# EISI IA — Sentinel-X

Deux scripts Python autonomes, exécutés sur le **PC Serveur Local**, qui couvrent les deux points
de la filière EISI IA du sujet :

- **`vision/`** — Vision Intelligente : webcam USB → détection d'intrus → `POST /api/v1/alerts`.
- **`predictive/`** — Maintenance Prédictive : télémétrie MQTT → détection d'anomalies par
  Isolation Forest → `POST /api/v1/alerts`.

Les deux s'appuient sur le même [contrat d'interface](../docs/contrat.md) et partagent `common/`
(l'appel HTTP vers `POST /alerts`) et un seul `.env`.

```
Webcam USB ──► vision/      ──► POST /api/v1/alerts (INTRUDER)
                             └─► Flux MJPEG :5000/video_feed (dashboard)

ESP8266 ──MQTT──► predictive/ ──► POST /api/v1/alerts (ANOMALY)
         (telemetry, lecture seule, compte "ai")
```

## Installation commune

```bash
cd ai
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# INGEST_TOKEN doit être strictement identique à celui généré dans api/.env (contrat §4.2)
```

```bash
python -m unittest discover -s tests   # les deux scripts, sans webcam/MQTT/API réels
```

---

## Vision Intelligente (`vision/`)

Capte le flux de la webcam USB branchée en direct sur le PC Serveur Local, isole toute présence
humaine en temps réel et déclenche une alerte `INTRUDER`.

```
Webcam USB → OpenCV (capture, 640x480) → Détecteur (YOLOv8-tiny ou HOG) → ┬→ POST /api/v1/alerts (si intrus, anti-rafale 30 s)
                                                                          └→ Flux MJPEG :5000/video_feed (annoté, pour le dashboard)
```

### Lancement

```bash
python -m vision.main
```

Le flux annoté est visible sur `http://localhost:5000/video_feed` (même route que celle
attendue par le composant `VideoFeed` du dashboard, cf. [contrat §6](../docs/contrat.md#6-flux-vidéo-ia)).
En HTTPS, aucune configuration supplémentaire n'est nécessaire : `dev/proxy/default.conf.template`
proxifie déjà `/video_feed` vers `AI_VIDEO_UPSTREAM` (`http://host.docker.internal:5000` par
défaut, cf. `dev/.env.example`) — le script doit donc tourner sur le PC qui héberge Docker, port
`5000` (valeur par défaut de `STREAM_PORT`).

Avec le [simulateur](../simulator) et l'[API](../api) lancés en parallèle, se tenir devant la
webcam doit : dessiner un cadre rouge « INTRUS » sur le flux, puis faire apparaître une alerte
`CRITICAL` côté dashboard dans les secondes qui suivent.

### Configuration (`.env`)

| Variable | Défaut | Rôle |
|---|---|---|
| `DEVICE_ID` | `SX-003` | Champ `device` du payload d'alerte (contrat §1) |
| `CAMERA_INDEX` | `0` | Index OpenCV de la webcam USB |
| `FRAME_WIDTH` / `FRAME_HEIGHT` | `640` / `480` | Bridage/redimensionnement avant inférence |
| `DETECTOR_BACKEND` | `yolo` | `yolo` (YOLOv8-tiny) ou `hog` (OpenCV, repli hors ligne) |
| `MODEL_PATH` | `yolov8n.pt` | Poids YOLO (téléchargés automatiquement au premier lancement — nécessite Internet) |
| `CONF_THRESHOLD` | `0.5` | Score minimal pour retenir une détection |
| `ALERT_COOLDOWN_S` | `30` | Anti-rafale : une alerte `INTRUDER` au plus toutes les N s |
| `API_URL` | `http://192.168.10.1:8080/api/v1` | Base REST de l'API |
| `INGEST_TOKEN` | — | Jeton `POST /alerts` (contrat §4.2), obligatoire |
| `STREAM_HOST` / `STREAM_PORT` | `0.0.0.0` / `5000` | Serveur MJPEG local |
| `MAX_FRAME_MS` | `100` | Budget de traitement par frame ; dépassement journalisé (pas bloquant) |

### Deux backends de détection

- **`yolo`** (par défaut) : YOLOv8-tiny (`ultralytics`), filtré sur la classe COCO `person`.
  Seul backend réellement démonstratif pour le jury (Axe 2 : « niveau d'inférence de l'IA »).
- **`hog`** : détecteur HOG + SVM d'OpenCV, sans poids à télécharger. Sert de plan B si la table
  n'a pas Internet le jour de la démo (le modèle YOLO doit sinon être pré-téléchargé à l'avance).

Les deux implémentent la même interface (`vision.detector.PersonDetector`) et renvoient des
`Detection` avec un score ramené sur `0..1`, ce qui permet de changer de backend par variable
d'environnement sans toucher au reste du pipeline.

### Pourquoi ces choix

- **Anti-rafale 30 s** (`vision/alerts.py`) : même logique que les règles de déclenchement ESP
  (contrat §3.2) — évite de saturer l'API et le dashboard d'alertes dupliquées pendant qu'un
  intrus reste dans le champ.
- **Publication HTTP asynchrone** : `AlertPublisher.maybe_publish` lance l'appel réseau dans un
  thread démon pour ne jamais bloquer la boucle de capture/inférence (budget visé : <100 ms/trame).
- **Aucune publication MQTT** : conforme au contrat (« le script IA ne publie pas d'alerte en
  MQTT »), tout passe par `POST /api/v1/alerts`.
- **Flux MJPEG séparé du flux d'alertes** : le dashboard peut afficher la vidéo annotée en continu
  sans dépendre de la fréquence des alertes, et inversement une alerte peut être publiée même si
  personne ne regarde le flux vidéo.

### Limites connues / pistes

- Le score HOG est une approximation logistique de la marge SVM, pas une vraie probabilité
  calibrée ; ne garder `yolo` que pour la démo si la précision du score affiché compte.
- La « zone surveillée » est actuellement le champ entier de la caméra ; un filtrage par ROI
  (polygone de détection) n'est pas implémenté.
- Pas de suivi multi-trame (tracking) : chaque frame est traitée indépendamment, donc pas de
  comptage de personnes uniques ni de trajectoire.

---

## Maintenance Prédictive (`predictive/`)

S'abonne en MQTT à `sentinel/<grp>/telemetry` (compte `ai`, lecture seule — contrat §2), détecte
des anomalies multivariées par **Isolation Forest** (scikit-learn) et déclenche une alerte
`ANOMALY`. Volontairement **sans aucun seuil statique de capteur** (le sujet interdit
explicitement un `if temp > 40`) : la frontière normal/anormal est apprise et ré-apprise en
continu à partir des données récentes elles-mêmes.

```
ESP8266/simulateur --MQTT telemetry--> predictive/
                                           │
                            FeatureBuilder (imputation, pente, écart-type glissants)
                                           │
                             DriftDetector (Isolation Forest, fenêtre glissante décalée)
                                           │
                       AnomalyAlertPublisher (N anomalies consécutives + cooldown)
                                           │
                                 POST /api/v1/alerts (source: AI_PREDICT, type: ANOMALY)
```

### Lancement

```bash
python -m predictive.main
```

Avec le [simulateur](../simulator) lancé, la touche `h` (« Échauffement lent ») déclenche une
dérive progressive de température + gaz, exactement le scénario que ce script est censé repérer
avant que les seuils fixes de l'ESP (`GAS_WARN`/`GAS_CRIT`) ne soient atteints. Compter plusieurs
minutes de chauffe du modèle avant la première notation (voir warm-up ci-dessous).

### Pipeline

1. **`features.FeatureBuilder`** — transforme chaque message `telemetry` (contrat §3.1) en un
   vecteur de 8 variables : `temp`, `hum`, `gas`, `dist` (valeurs imputées à la dernière lecture
   connue si le capteur renvoie `null`), plus `temp_slope`/`gas_slope` (pente sur une fenêtre
   glissante — capte une **dérive lente**) et `temp_std`/`gas_std` (volatilité récente).
2. **`model.DriftDetector`** — entraîne un `IsolationForest` sur une fenêtre glissante
   `TRAIN_WINDOW`, mais qui **exclut les `SCORING_GAP` échantillons les plus récents** : c'est
   justement l'échantillon courant (le plus récent) qui est noté contre ce modèle légèrement
   décalé. Un incident en cours ne peut donc pas s'auto-normaliser en polluant son propre jeu
   d'entraînement pendant qu'il se développe, alors qu'une dérive bénigne (saisonnière) finit
   par être absorbée une fois sortie de la fenêtre de décalage — pas de faux positifs permanents.
3. **`alerts.AnomalyAlertPublisher`** — double anti-rafale : il faut `CONSEC_REQUIRED` notations
   anormales **consécutives** (filtre le bruit ponctuel d'une seule mesure), puis respecte un
   cooldown entre deux alertes publiées.

### Configuration (`.env`)

| Variable | Défaut | Rôle |
|---|---|---|
| `GROUP_ID` | `g3` | Construit le topic `sentinel/g3/telemetry` (contrat §1) |
| `MQTT_URL` / `MQTT_USERNAME` / `MQTT_PASSWORD` / `MQTT_CLIENT_ID` | — / `ai` / — / `ai-g3` | Broker, compte lecture seule sur `telemetry` (contrat §2, `dev/mosquitto/acl`) |
| `MQTT_CA_FILE` | vide | CA locale pour `mqtts://` (docs/tls.md), ignorée en `mqtt://` |
| `SLOPE_WINDOW` | `10` | Échantillons utilisés pour calculer une pente (dérive) |
| `TRAIN_WINDOW` | `90` | Taille de la fenêtre d'entraînement du modèle |
| `SCORING_GAP` | `15` | Échantillons récents exclus de l'entraînement (voir pipeline ci-dessus) |
| `REFIT_EVERY` | `5` | Réentraîner le modèle tous les N nouveaux échantillons |
| `CONTAMINATION` | `0.05` | Proportion attendue d'anomalies dans la fenêtre (paramètre natif scikit-learn) |
| `CONSEC_REQUIRED` | `3` | Anomalies consécutives avant publication |
| `PREDICT_ALERT_COOLDOWN_S` | `60` | Cooldown entre deux alertes `ANOMALY` |
| `CRIT_THRESHOLD` | `0.85` | Score de sévérité à partir duquel l'alerte est `CRITICAL` plutôt que `WARNING` |

### Warm-up

Le modèle ne peut rien noter tant que `SLOPE_WINDOW + TRAIN_WINDOW + SCORING_GAP` échantillons
n'ont pas été reçus (valeurs par défaut : ~115 échantillons, soit ~4 minutes à raison d'une
mesure toutes les 2 s). C'est voulu — un détecteur de dérive doit observer un comportement
« normal » avant de pouvoir reconnaître un écart. **Démarrer ce script plusieurs minutes avant
la démo**, pas au moment de passer devant le jury.

### Pourquoi ces choix

- **Isolation Forest plutôt que des seuils** : répond directement à la contrainte du sujet
  (« interdiction d'utiliser de simples structures conditionnelles statiques »). C'est aussi un
  choix pragmatique : pas de données étiquetées « anomalie » disponibles pour entraîner un
  modèle supervisé (Random Forest), alors qu'Isolation Forest est non supervisé — il isole les
  points atypiques sans avoir jamais vu d'exemple d'incident.
- **Fenêtre d'entraînement décalée (`SCORING_GAP`)** : sans ce décalage, un modèle réentraîné en
  continu finit par apprendre l'anomalie elle-même si elle dure plus longtemps que la fenêtre de
  ré-entraînement — un piège classique du « concept drift » en détection d'anomalies en ligne.
- **Features dérivées (pente, écart-type) en plus des valeurs brutes** : une IsolationForest sur
  les seules valeurs instantanées ne verrait qu'un `gas=360` ou `temp=24`, chacun plausible
  individuellement. Les pentes/écarts-types rendent visible la **corrélation** citée en exemple
  dans le sujet (« hausse lente de température et micro-déviation de gaz ») sans l'encoder à la
  main : c'est l'Isolation Forest qui découvre que la combinaison est inhabituelle.
- **Double anti-rafale (consécutif + cooldown)** : une IsolationForest sur un flux bruité
  déclenche parfois une notation anormale isolée sans rien de réel derrière ; exiger plusieurs
  notations anormales d'affilée avant de publier élimine l'essentiel de ce bruit.

### Limites connues / pistes

- Le warm-up (~4 min par défaut) empêche toute détection immédiate après un redémarrage du
  script ; réduire `TRAIN_WINDOW`/`SCORING_GAP` accélère la mise en route au prix d'un modèle
  moins stable.
- Le modèle n'est jamais sauvegardé sur disque : un redémarrage perd l'historique et repart en
  warm-up.
- `top_features` (dans le message d'alerte) est une approximation par z-score univarié ; ce n'est
  pas une vraie décomposition de l'importance des features d'IsolationForest (ex. SHAP), qui
  serait plus coûteuse à calculer en temps réel.

---

## Tests

```bash
python -m unittest discover -s tests
```

- `test_alerts.py` — `vision/` : format du payload `INTRUDER` et anti-rafale (mock `requests.post`).
- `test_predictive_features.py` — imputation des valeurs manquantes, calcul de pente.
- `test_predictive_model.py` — warm-up du détecteur, puis détection d'un point clairement hors
  distribution après apprentissage sur une série « normale » bruitée.
- `test_predictive_pipeline.py` — bout en bout : série synthétique normale puis dérive lente
  corrélée temp/gaz (l'exemple du sujet), et vérifie qu'une alerte `ANOMALY` est bien publiée
  **alors que le gaz ne dépasse jamais `GAS_WARN=400`** — la preuve que la détection ne repose
  pas sur un seuil statique déguisé.

Aucun de ces tests n'a besoin d'une webcam, d'un broker MQTT ou d'une API réels.
