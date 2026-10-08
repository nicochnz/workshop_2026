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
    camera_index: int
    frame_width: int
    frame_height: int
    detector_backend: str
    model_path: str
    conf_threshold: float
    alert_cooldown_s: float
    api_url: str
    ingest_token: str
    stream_host: str
    stream_port: int
    max_frame_ms: float


def load_config() -> Config:
    api_url = os.getenv("API_URL", "").rstrip("/")
    ingest_token = os.getenv("INGEST_TOKEN", "")
    if not api_url:
        raise RuntimeError("API_URL manquant : impossible de publier les alertes (voir .env.example)")
    if not ingest_token:
        raise RuntimeError("INGEST_TOKEN manquant : l'API refusera POST /alerts (voir .env.example)")

    return Config(
        device_id=os.getenv("DEVICE_ID", "SX-003"),
        camera_index=_get_int("CAMERA_INDEX", 0),
        frame_width=_get_int("FRAME_WIDTH", 640),
        frame_height=_get_int("FRAME_HEIGHT", 480),
        detector_backend=os.getenv("DETECTOR_BACKEND", "yolo"),
        model_path=os.getenv("MODEL_PATH", "yolov8n.pt"),
        conf_threshold=_get_float("CONF_THRESHOLD", 0.5),
        alert_cooldown_s=_get_float("ALERT_COOLDOWN_S", 30.0),
        api_url=api_url,
        ingest_token=ingest_token,
        stream_host=os.getenv("STREAM_HOST", "0.0.0.0"),
        stream_port=_get_int("STREAM_PORT", 5000),
        max_frame_ms=_get_float("MAX_FRAME_MS", 100.0),
    )
