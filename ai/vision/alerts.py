from __future__ import annotations

import logging
import threading
import time

import requests

from common.http_alerts import post_alert

from .config import Config
from .detector import Detection

logger = logging.getLogger("vision.alerts")


class AlertPublisher:
    """POST /api/v1/alerts (contrat §3.2/§4.3), anti-rafale, sans bloquer la boucle vidéo.

    Le script IA ne publie jamais en MQTT (contrat §2) : seul ce canal REST existe pour lui.
    """

    def __init__(self, config: Config) -> None:
        self._config = config
        self._last_sent_at = 0.0
        self._lock = threading.Lock()

    def maybe_publish(self, detection: Detection) -> None:
        now = time.time()
        with self._lock:
            if now - self._last_sent_at < self._config.alert_cooldown_s:
                return
            self._last_sent_at = now
        threading.Thread(target=self._publish, args=(detection, now), daemon=True).start()

    def _publish(self, detection: Detection, ts: float) -> None:
        payload = {
            "device": self._config.device_id,
            "ts": int(ts),
            "source": "AI_VISION",
            "type": "INTRUDER",
            "level": "CRITICAL",
            "score": round(detection.score, 3),
            "message": "Personne détectée dans la zone surveillée",
        }
        try:
            post_alert(self._config.api_url, self._config.ingest_token, payload)
            logger.info("Alerte INTRUDER publiée (score=%.2f)", detection.score)
        except requests.RequestException:
            logger.exception("Échec de publication de l'alerte INTRUDER")
