"""Tests sans webcam ni API réelle : vérifient l'anti-rafale et le format du payload
POST /alerts (contrat §3.2), par comparaison avec des doublures (mock `requests.post`).

Lancer depuis ai/ : python -m unittest discover -s tests
"""

from __future__ import annotations

import time
import unittest
from unittest.mock import MagicMock, patch

from vision.alerts import AlertPublisher
from vision.config import Config
from vision.detector import Detection


def make_config(**overrides) -> Config:
    base = dict(
        device_id="SX-003",
        camera_index=0,
        frame_width=640,
        frame_height=480,
        detector_backend="hog",
        model_path="yolov8n.pt",
        conf_threshold=0.5,
        alert_cooldown_s=30.0,
        api_url="http://localhost:8080/api/v1",
        ingest_token="test-token",
        stream_host="0.0.0.0",
        stream_port=5000,
        max_frame_ms=100.0,
    )
    base.update(overrides)
    return Config(**base)


class AlertPublisherTest(unittest.TestCase):
    def test_publishes_contract_shaped_payload(self) -> None:
        config = make_config()
        publisher = AlertPublisher(config)
        detection = Detection(10, 10, 50, 50, 0.87)

        with patch("common.http_alerts.requests.post") as post:
            post.return_value = MagicMock(status_code=201)
            publisher.maybe_publish(detection)
            # maybe_publish envoie en arrière-plan : laisser le thread s'exécuter.
            time.sleep(0.05)

        post.assert_called_once()
        _, kwargs = post.call_args
        payload = kwargs["json"]
        self.assertEqual(payload["device"], "SX-003")
        self.assertEqual(payload["source"], "AI_VISION")
        self.assertEqual(payload["type"], "INTRUDER")
        self.assertEqual(payload["level"], "CRITICAL")
        self.assertAlmostEqual(payload["score"], 0.87)
        self.assertEqual(
            kwargs["headers"]["Authorization"], "Bearer test-token"
        )

    def test_cooldown_suppresses_repeat_alerts(self) -> None:
        config = make_config(alert_cooldown_s=30.0)
        publisher = AlertPublisher(config)
        detection = Detection(0, 0, 10, 10, 0.9)

        with patch("common.http_alerts.requests.post") as post:
            post.return_value = MagicMock(status_code=201)
            publisher.maybe_publish(detection)
            publisher.maybe_publish(detection)  # dans la même fenêtre de 30 s : ignoré
            time.sleep(0.05)

        post.assert_called_once()


if __name__ == "__main__":
    unittest.main()
