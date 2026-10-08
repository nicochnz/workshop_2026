from __future__ import annotations

from collections import deque
from dataclasses import dataclass

import numpy as np

# L'ultrason renvoie `null` quand rien n'est dans sa portée (contrat §3.1) : on le
# remplace par sa valeur max plutôt que de casser la fenêtre glissante, puisque
# "hors de portée" signifie justement "rien de proche".
DIST_FALLBACK_CM = 400.0
DEFAULT_TEMP_C = 20.0
DEFAULT_HUM_PCT = 45.0

FEATURE_NAMES = [
    "temp",
    "hum",
    "gas",
    "dist",
    "temp_slope",
    "gas_slope",
    "temp_std",
    "gas_std",
]


@dataclass(frozen=True)
class Telemetry:
    """Sous-ensemble du message `telemetry` (contrat §3.1) utile au scoring."""

    ts: float
    temp: float | None
    hum: float | None
    gas: float
    dist: float | None


@dataclass(frozen=True)
class FeatureVector:
    ts: float
    values: np.ndarray  # ordre : FEATURE_NAMES


def _slope(values: list[float]) -> float:
    """Pente d'une régression linéaire 1D (coefficient directeur), sans dépendance à
    scikit-learn pour un calcul aussi simple — capte la "hausse lente" citée en exemple
    dans le sujet, pas seulement la valeur instantanée."""
    if len(values) < 2:
        return 0.0
    x = np.arange(len(values), dtype=float)
    y = np.asarray(values, dtype=float)
    x_mean, y_mean = x.mean(), y.mean()
    denom = ((x - x_mean) ** 2).sum()
    if denom == 0:
        return 0.0
    return float(((x - x_mean) * (y - y_mean)).sum() / denom)


class FeatureBuilder:
    """Transforme le flux brut de télémétrie en vecteurs de features pour le modèle.

    Impute les valeurs manquantes (DHT22 en échec, ultrason hors portée, contrat §3.1)
    par la dernière valeur connue, pour qu'un seul capteur bruité ne casse pas la fenêtre
    glissante des autres.
    """

    def __init__(self, slope_window: int) -> None:
        self._slope_window = slope_window
        self._temp_hist: deque[float] = deque(maxlen=slope_window)
        self._gas_hist: deque[float] = deque(maxlen=slope_window)
        self._last_temp = DEFAULT_TEMP_C
        self._last_hum = DEFAULT_HUM_PCT
        self._last_dist = DIST_FALLBACK_CM

    def push(self, sample: Telemetry) -> FeatureVector | None:
        temp = sample.temp if sample.temp is not None else self._last_temp
        hum = sample.hum if sample.hum is not None else self._last_hum
        dist = sample.dist if sample.dist is not None else self._last_dist
        self._last_temp, self._last_hum, self._last_dist = temp, hum, dist

        self._temp_hist.append(temp)
        self._gas_hist.append(sample.gas)

        if len(self._temp_hist) < self._slope_window:
            return None  # pas encore assez d'historique pour une pente fiable

        temp_slope = _slope(list(self._temp_hist))
        gas_slope = _slope(list(self._gas_hist))
        temp_std = float(np.std(self._temp_hist))
        gas_std = float(np.std(self._gas_hist))

        values = np.array(
            [temp, hum, sample.gas, dist, temp_slope, gas_slope, temp_std, gas_std],
            dtype=float,
        )
        return FeatureVector(ts=sample.ts, values=values)
