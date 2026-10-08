from __future__ import annotations

import logging

from .alerts import AnomalyAlertPublisher
from .config import load_config
from .features import FeatureBuilder
from .model import DriftDetector
from .mqtt_client import TelemetrySubscriber

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
logger = logging.getLogger("predictive.main")

# Cadence ESP (contrat §2) : une mesure toutes les 2 s.
TELEMETRY_INTERVAL_S = 2


def main() -> None:
    config = load_config()
    feature_builder = FeatureBuilder(slope_window=config.slope_window)
    detector = DriftDetector(
        train_window=config.train_window,
        scoring_gap=config.scoring_gap,
        refit_every=config.refit_every,
        contamination=config.contamination,
    )
    publisher = AnomalyAlertPublisher(config)
    subscriber = TelemetrySubscriber(config, feature_builder, detector, publisher)

    warmup_samples = config.train_window + config.scoring_gap + config.slope_window
    logger.info(
        "Démarrage : ~%d échantillons de chauffe nécessaires avant la première notation "
        "(~%d s à %ds/mesure)",
        warmup_samples,
        warmup_samples * TELEMETRY_INTERVAL_S,
        TELEMETRY_INTERVAL_S,
    )

    subscriber.run_forever()


if __name__ == "__main__":
    main()
