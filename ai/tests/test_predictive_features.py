from __future__ import annotations

import unittest

from predictive.features import DEFAULT_TEMP_C, FeatureBuilder, Telemetry


class FeatureBuilderTest(unittest.TestCase):
    def test_returns_none_until_slope_window_is_full(self) -> None:
        builder = FeatureBuilder(slope_window=5)
        for i in range(4):
            sample = Telemetry(ts=float(i), temp=22.0, hum=45.0, gas=300.0, dist=150.0)
            self.assertIsNone(builder.push(sample))

        feature = builder.push(Telemetry(ts=5.0, temp=22.0, hum=45.0, gas=300.0, dist=150.0))
        self.assertIsNotNone(feature)

    def test_positive_slope_on_rising_temperature(self) -> None:
        builder = FeatureBuilder(slope_window=5)
        feature = None
        for i in range(10):
            sample = Telemetry(ts=float(i), temp=20.0 + i, hum=45.0, gas=300.0, dist=150.0)
            feature = builder.push(sample)

        assert feature is not None
        temp_slope_index = 4  # FEATURE_NAMES: temp, hum, gas, dist, temp_slope, ...
        self.assertGreater(feature.values[temp_slope_index], 0)

    def test_missing_sensor_reading_is_imputed_from_last_known_value(self) -> None:
        builder = FeatureBuilder(slope_window=3)
        builder.push(Telemetry(ts=0.0, temp=25.0, hum=50.0, gas=300.0, dist=150.0))
        builder.push(Telemetry(ts=1.0, temp=25.0, hum=50.0, gas=300.0, dist=150.0))
        # DHT22 en échec (contrat §3.1 : temp/hum peuvent être `null`)
        feature = builder.push(Telemetry(ts=2.0, temp=None, hum=None, gas=300.0, dist=150.0))

        assert feature is not None
        self.assertEqual(feature.values[0], 25.0)  # temp imputé à la dernière valeur connue
        self.assertEqual(feature.values[1], 50.0)  # hum idem

    def test_first_sample_missing_falls_back_to_default(self) -> None:
        builder = FeatureBuilder(slope_window=1)
        feature = builder.push(Telemetry(ts=0.0, temp=None, hum=None, gas=300.0, dist=None))

        assert feature is not None
        self.assertEqual(feature.values[0], DEFAULT_TEMP_C)


if __name__ == "__main__":
    unittest.main()
