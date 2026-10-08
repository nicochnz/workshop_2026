from __future__ import annotations

import logging
import threading
import time

import requests

from common.http_alerts import post_alert

from .config import Config
from .model import AnomalyScore

logger = logging.getLogger("predictive.alerts")

FEATURE_LABELS = {
    "temp": "température",
    "hum": "humidité",
    "gas": "gaz",
    "dist": "distance",
    "temp_slope": "dérive de température",
    "gas_slope": "dérive de gaz",
    "temp_std": "instabilité de température",
    "gas_std": "instabilité de gaz",
}


class AnomalyAlertPublisher:
    """POST /api/v1/alerts (ANOMALY, contrat §3.2), double anti-rafale :

    1. `consec_required` notations anormales consécutives (filtre le bruit ponctuel d'un
       capteur — une seule frame aberrante ne déclenche jamais une alerte) ;
    2. un cooldown temporel une fois l'alerte envoyée.
    """

    def __init__(self, config: Config) -> None:
        self._config = config
        self._consecutive = 0
        self._last_sent_at = 0.0
        self._lock = threading.Lock()

    def observe(self, score: AnomalyScore) -> None:
        if not score.is_anomaly:
            with self._lock:
                self._consecutive = 0
            return

        with self._lock:
            self._consecutive += 1
            now = time.time()
            should_publish = (
                self._consecutive >= self._config.consec_required
                and now - self._last_sent_at >= self._config.alert_cooldown_s
            )
            if not should_publish:
                return
            self._last_sent_at = now

        threading.Thread(target=self._publish, args=(score, now), daemon=True).start()

    def _publish(self, score: AnomalyScore, ts: float) -> None:
        level = "CRITICAL" if score.severity >= self._config.crit_threshold else "WARNING"
        labels = " / ".join(FEATURE_LABELS.get(f, f) for f in score.top_features)
        payload = {
            "device": self._config.device_id,
            "ts": int(ts),
            "source": "AI_PREDICT",
            "type": "ANOMALY",
            "level": level,
            "score": round(score.severity, 3),
            "message": f"Dérive anormale détectée ({labels})",
        }
        try:
            post_alert(self._config.api_url, self._config.ingest_token, payload)
            logger.info("Alerte ANOMALY publiée (%s, score=%.2f)", level, score.severity)
        except requests.RequestException:
            logger.exception("Échec de publication de l'alerte ANOMALY")
