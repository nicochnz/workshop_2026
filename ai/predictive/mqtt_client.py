from __future__ import annotations

import json
import logging
import ssl
from urllib.parse import urlparse

import paho.mqtt.client as mqtt

from .alerts import AnomalyAlertPublisher
from .config import Config
from .features import FeatureBuilder, Telemetry
from .model import DriftDetector

logger = logging.getLogger("predictive.mqtt")


class TelemetrySubscriber:
    """S'abonne à `sentinel/<grp>/telemetry` (compte MQTT `ai`, lecture seule — contrat §2)
    et pousse chaque message dans le pipeline features -> modèle -> alertes."""

    def __init__(
        self,
        config: Config,
        feature_builder: FeatureBuilder,
        detector: DriftDetector,
        publisher: AnomalyAlertPublisher,
    ) -> None:
        self._config = config
        self._feature_builder = feature_builder
        self._detector = detector
        self._publisher = publisher
        self._topic = f"sentinel/{config.group_id}/telemetry"

        self._client = mqtt.Client(client_id=config.mqtt_client_id, clean_session=True)
        self._client.username_pw_set(config.mqtt_username, config.mqtt_password)
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message

        parsed = urlparse(config.mqtt_url)
        self._host = parsed.hostname or "localhost"
        self._port = parsed.port or (8883 if parsed.scheme == "mqtts" else 1883)
        if parsed.scheme == "mqtts":
            if not config.mqtt_ca_file:
                raise RuntimeError(
                    "MQTT_URL est en mqtts:// mais MQTT_CA_FILE est vide (voir docs/tls.md)"
                )
            self._client.tls_set(ca_certs=config.mqtt_ca_file, tls_version=ssl.PROTOCOL_TLS_CLIENT)

    def run_forever(self) -> None:
        logger.info("Connexion MQTT à %s:%s (abonnement %s)", self._host, self._port, self._topic)
        self._client.connect(self._host, self._port, keepalive=30)
        self._client.loop_forever(retry_first_connection=True)

    def _on_connect(self, client: mqtt.Client, userdata, flags, rc: int) -> None:
        if rc != 0:
            logger.error("Connexion MQTT refusée (code %s)", rc)
            return
        logger.info("Connecté au broker, abonnement à %s", self._topic)
        client.subscribe(self._topic, qos=0)

    def _on_disconnect(self, client: mqtt.Client, userdata, rc: int) -> None:
        logger.warning("Déconnecté du broker (code %s) — reconnexion automatique", rc)

    def _on_message(self, client: mqtt.Client, userdata, message: mqtt.MQTTMessage) -> None:
        try:
            payload = json.loads(message.payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            logger.warning("Message telemetry illisible, ignoré")
            return

        if payload.get("device") != self._config.device_id:
            return  # un seul boîtier attendu (contrat §1) ; on ignore tout le reste

        try:
            sample = Telemetry(
                ts=float(payload.get("ts", 0)),
                temp=payload.get("temp"),
                hum=payload.get("hum"),
                gas=float(payload["gas"]),
                dist=payload.get("dist"),
            )
        except (KeyError, TypeError, ValueError):
            logger.warning("Payload telemetry hors contrat, ignoré : %r", payload)
            return

        self._process(sample)

    def _process(self, sample: Telemetry) -> None:
        feature = self._feature_builder.push(sample)
        if feature is None:
            return  # chauffe de la fenêtre de pente (contrat : pas encore assez d'historique)

        score = self._detector.observe(feature)
        if score is None:
            return  # chauffe du modèle (fenêtre d'entraînement pas encore pleine)

        logger.debug(
            "severity=%.2f anomaly=%s top=%s", score.severity, score.is_anomaly, score.top_features
        )
        self._publisher.observe(score)
