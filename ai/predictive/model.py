from __future__ import annotations

import logging
import threading
from collections import deque
from dataclasses import dataclass

import numpy as np
from sklearn.ensemble import IsolationForest

from .features import FEATURE_NAMES, FeatureVector

logger = logging.getLogger("predictive.model")


@dataclass(frozen=True)
class AnomalyScore:
    severity: float  # 0..1, plus haut = plus anormal (frontière apprise par le modèle)
    is_anomaly: bool
    top_features: list[str]  # les features qui s'écartent le plus de la moyenne d'entraînement


class DriftDetector:
    """Isolation Forest (scikit-learn) sur fenêtre glissante décalée.

    Pas de seuil statique écrit en dur (contrainte du sujet : interdiction de `if temp > 40`) :
    la frontière normal/anormal est ré-apprise périodiquement à partir des données récentes
    elles-mêmes. Le modèle est entraîné sur une fenêtre `train_window` qui EXCLUT les
    `scoring_gap` derniers échantillons, et c'est justement l'échantillon le plus récent qui
    est noté contre ce modèle : un incident en cours ne peut donc pas s'auto-normaliser en
    polluant son propre jeu d'entraînement pendant qu'il se développe. Une dérive bénigne
    (ex. variation saisonnière) finit par être absorbée une fois sortie de la fenêtre de
    décalage, ce qui évite les faux positifs permanents.
    """

    def __init__(
        self,
        train_window: int,
        scoring_gap: int,
        refit_every: int,
        contamination: float,
    ) -> None:
        self._train_window = train_window
        self._scoring_gap = scoring_gap
        self._refit_every = refit_every
        self._contamination = contamination
        self._history: deque[FeatureVector] = deque(maxlen=train_window + scoring_gap)
        self._model: IsolationForest | None = None
        self._mean: np.ndarray | None = None
        self._std: np.ndarray | None = None
        self._since_refit = 0
        self._lock = threading.Lock()

    @property
    def ready(self) -> bool:
        return len(self._history) >= self._train_window + self._scoring_gap

    def observe(self, feature: FeatureVector) -> AnomalyScore | None:
        self._history.append(feature)
        if not self.ready:
            return None

        self._since_refit += 1
        if self._model is None or self._since_refit >= self._refit_every:
            self._refit()
            self._since_refit = 0

        return self._score(feature)

    def _training_matrix(self) -> np.ndarray:
        items = list(self._history)
        if self._scoring_gap:
            items = items[: -self._scoring_gap]
        return np.stack([item.values for item in items])

    def _refit(self) -> None:
        matrix = self._training_matrix()
        mean = matrix.mean(axis=0)
        std = matrix.std(axis=0)
        std[std == 0] = 1e-6  # évite une division par zéro si un capteur reste figé
        model = IsolationForest(
            n_estimators=100, contamination=self._contamination, random_state=42
        )
        model.fit(matrix)
        with self._lock:
            self._model, self._mean, self._std = model, mean, std
        logger.debug("Isolation Forest réentraîné sur %d échantillons", len(matrix))

    def _score(self, feature: FeatureVector) -> AnomalyScore:
        with self._lock:
            model, mean, std = self._model, self._mean, self._std
        assert model is not None and mean is not None and std is not None

        x = feature.values.reshape(1, -1)
        decision = float(model.decision_function(x)[0])
        is_anomaly = bool(model.predict(x)[0] == -1)
        # decision_function : positif = normal, négatif = anormal, frontière apprise par
        # le modèle (pas un seuil choisi à la main). Sigmoïde pour ramener sur 0..1.
        severity = float(1 / (1 + np.exp(decision * 8)))

        z_scores = np.abs((feature.values - mean) / std)
        top_idx = np.argsort(z_scores)[::-1][:2]
        top_features = [FEATURE_NAMES[i] for i in top_idx]

        return AnomalyScore(severity=severity, is_anomaly=is_anomaly, top_features=top_features)
