from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _get_int(name: str, default: int) -> int:
    value = os.getenv(name)
    return int(value) if value else default


def _get_float(name: str, default: float) -> float:
    value = os.getenv(name)
    return float(value) if value else default


@dataclass(frozen=True)
class Config:
    device_id: str
    group_id: str
    mqtt_url: str
    mqtt_username: str
    mqtt_password: str
    mqtt_client_id: str
    mqtt_ca_file: str
    api_url: str
    ingest_token: str
    slope_window: int
    train_window: int
    scoring_gap: int
    refit_every: int
    contamination: float
    consec_required: int
    alert_cooldown_s: float
    crit_threshold: float


def load_config() -> Config:
    api_url = os.getenv("API_URL", "").rstrip("/")
    ingest_token = os.getenv("INGEST_TOKEN", "")
    mqtt_password = os.getenv("MQTT_PASSWORD", "")
    if not api_url:
        raise RuntimeError("API_URL manquant : impossible de publier les alertes (voir .env.example)")
    if not ingest_token:
        raise RuntimeError("INGEST_TOKEN manquant : l'API refusera POST /alerts (voir .env.example)")
    if not mqtt_password:
        raise RuntimeError("MQTT_PASSWORD manquant : le broker refusera la connexion (voir .env.example)")

    return Config(
        device_id=os.getenv("DEVICE_ID", "SX-003"),
        group_id=os.getenv("GROUP_ID", "g3"),
        mqtt_url=os.getenv("MQTT_URL", "mqtt://localhost:1883"),
        mqtt_username=os.getenv("MQTT_USERNAME", "ai"),
        mqtt_password=mqtt_password,
        mqtt_client_id=os.getenv("MQTT_CLIENT_ID", "ai-g3"),
        mqtt_ca_file=os.getenv("MQTT_CA_FILE", ""),
        api_url=api_url,
        ingest_token=ingest_token,
        slope_window=_get_int("SLOPE_WINDOW", 10),
        train_window=_get_int("TRAIN_WINDOW", 90),
        scoring_gap=_get_int("SCORING_GAP", 15),
        refit_every=_get_int("REFIT_EVERY", 5),
        contamination=_get_float("CONTAMINATION", 0.05),
        consec_required=_get_int("CONSEC_REQUIRED", 3),
        # Nom distinct de ALERT_COOLDOWN_S (vision/) : les deux scripts partagent .env mais
        # ont des cadences d'alerte différentes, pas question qu'ils se marchent dessus.
        alert_cooldown_s=_get_float("PREDICT_ALERT_COOLDOWN_S", 60.0),
        crit_threshold=_get_float("CRIT_THRESHOLD", 0.85),
    )
