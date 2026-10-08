from __future__ import annotations

import unittest

import numpy as np

from predictive.features import FeatureVector
from predictive.model import DriftDetector


def make_vector(ts: float, values: list[float]) -> FeatureVector:
    return FeatureVector(ts=ts, values=np.array(values, dtype=float))


class DriftDetectorTest(unittest.TestCase):
    def test_not_ready_before_warmup(self) -> None:
        detector = DriftDetector(train_window=20, scoring_gap=5, refit_every=5, contamination=0.05)
        for i in range(24):
            score = detector.observe(make_vector(float(i), [22, 45, 300, 150, 0, 0, 0.3, 10]))
            self.assertIsNone(score)
        self.assertFalse(detector.ready)

    def test_flags_outlier_after_warmup(self) -> None:
        detector = DriftDetector(train_window=30, scoring_gap=5, refit_every=5, contamination=0.05)
        rng = np.random.default_rng(42)

        last_score = None
        for i in range(35):
            values = [
                22.0 + rng.normal(0, 0.2),
                45.0 + rng.normal(0, 1.0),
                300.0 + rng.normal(0, 10),
                150.0 + rng.normal(0, 5),
                rng.normal(0, 0.02),
                rng.normal(0, 0.5),
                0.3 + rng.normal(0, 0.05),
                10.0 + rng.normal(0, 2),
            ]
            last_score = detector.observe(make_vector(float(i), values))

        self.assertTrue(detector.ready)
        assert last_score is not None
        self.assertFalse(last_score.is_anomaly)  # dernier point de la série "normale"

        # Dérive nette, corrélée temp/gaz (exemple du sujet) — mais toujours sous
        # GAS_WARN=400 (contrat §3.2), donc invisible à un simple `if gas > 400`.
        anomalous = make_vector(
            35.0, [26.0, 45.5, 360.0, 151.0, 0.15, 3.0, 0.3, 11.0]
        )
        score = detector.observe(anomalous)

        assert score is not None
        self.assertTrue(score.is_anomaly)
        self.assertGreater(score.severity, 0.5)
        self.assertTrue(set(score.top_features) & {"temp", "gas", "temp_slope", "gas_slope"})


if __name__ == "__main__":
    unittest.main()
