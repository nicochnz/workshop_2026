"""Test de bout en bout de predictive/ sans MQTT ni API réels : génère une série
temporelle synthétique (normale puis dérive lente et corrélée temp/gaz, comme l'exemple
du sujet) et vérifie qu'une alerte ANOMALY finit par être publiée alors qu'aucun capteur
ne dépasse jamais individuellement le seuil statique GAS_WARN=400 (contrat §3.2) — la
preuve que ce n'est pas un simple `if gas > seuil` déguisé.

Lancer depuis ai/ : python -m unittest discover -s tests
"""

from __future__ import annotations

import time
import unittest
from unittest.mock import MagicMock, patch

import numpy as np

from predictive.alerts import AnomalyAlertPublisher
from predictive.config import Config
from predictive.features import FeatureBuilder, Telemetry
from predictive.model import DriftDetector
from predictive.mqtt_client import TelemetrySubscriber

GAS_WARN = 400.0  # contrat §3.2, pour mémoire dans ce test


def make_config(**overrides) -> Config:
    base = dict(
        device_id="SX-003",
        group_id="g3",
        mqtt_url="mqtt://localhost:1883",
        mqtt_username="ai",
        mqtt_password="test-password",
        mqtt_client_id="ai-g3",
        mqtt_ca_file="",
        api_url="http://localhost:8080/api/v1",
        ingest_token="test-token",
        slope_window=5,
        train_window=20,
        scoring_gap=5,
        refit_every=5,
        contamination=0.05,
        consec_required=2,
        alert_cooldown_s=0.0,
        crit_threshold=0.85,
    )
    base.update(overrides)
    return Config(**base)


class PredictivePipelineTest(unittest.TestCase):
    def test_slow_correlated_drift_triggers_anomaly_below_static_thresholds(self) -> None:
        config = make_config()
        feature_builder = FeatureBuilder(slope_window=config.slope_window)
        detector = DriftDetector(
            train_window=config.train_window,
            scoring_gap=config.scoring_gap,
            refit_every=config.refit_every,
            contamination=config.contamination,
        )
        publisher = AnomalyAlertPublisher(config)
        subscriber = TelemetrySubscriber(config, feature_builder, detector, publisher)

        rng = np.random.default_rng(42)

        def normal_sample(i: int) -> Telemetry:
            return Telemetry(
                ts=float(i),
                temp=22.0 + rng.normal(0, 0.2),
                hum=45.0 + rng.normal(0, 1.0),
                gas=300.0 + rng.normal(0, 10),
                dist=150.0 + rng.normal(0, 5),
            )

        warmup = config.slope_window + config.train_window + config.scoring_gap
        for i in range(warmup):
            subscriber._process(normal_sample(i))

        max_gas_seen = 0.0
        fired = False

        with patch("common.http_alerts.requests.post") as post:
            post.return_value = MagicMock(status_code=201)

            for i in range(80):
                drift = i * 0.15
                gas = 300.0 + drift * 8 + rng.normal(0, 10)
                max_gas_seen = max(max_gas_seen, gas)
                sample = Telemetry(
                    ts=float(warmup + i),
                    temp=22.0 + drift + rng.normal(0, 0.2),
                    hum=45.0 + rng.normal(0, 1.0),
                    gas=gas,
                    dist=150.0 + rng.normal(0, 5),
                )
                subscriber._process(sample)
                time.sleep(0.02)
                if post.called:
                    fired = True
                    break

            self.assertTrue(
                fired, "la dérive lente corrélée temp/gaz aurait dû déclencher une alerte"
            )
            time.sleep(0.05)  # laisser le thread de publication finir d'écrire call_args
            _, kwargs = post.call_args
            payload = kwargs["json"]

        self.assertLess(max_gas_seen, GAS_WARN, "le test doit rester sous le seuil statique ESP")
        self.assertEqual(payload["source"], "AI_PREDICT")
        self.assertEqual(payload["type"], "ANOMALY")
        self.assertIn(payload["level"], {"WARNING", "CRITICAL"})
        self.assertIn("device", payload)


if __name__ == "__main__":
    unittest.main()
