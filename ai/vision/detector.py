from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Protocol

import numpy as np

# Classe COCO "person" — seule classe retenue, conformément au périmètre de la mission
# (détection de présence humaine, pas de classification d'objets générique).
PERSON_CLASS_ID = 0


@dataclass(frozen=True)
class Detection:
    x1: int
    y1: int
    x2: int
    y2: int
    score: float

    @property
    def center(self) -> tuple[int, int]:
        return (self.x1 + self.x2) // 2, (self.y1 + self.y2) // 2


class PersonDetector(Protocol):
    def detect(self, frame: np.ndarray) -> list[Detection]: ...


class YoloPersonDetector:
    """YOLOv8-tiny (ultralytics), filtré sur la classe 'person'. Backend par défaut."""

    def __init__(self, model_path: str, conf_threshold: float) -> None:
        from ultralytics import YOLO  # import tardif : coûteux, inutile si backend=hog

        self._model = YOLO(model_path)
        self._conf_threshold = conf_threshold

    def detect(self, frame: np.ndarray) -> list[Detection]:
        results = self._model.predict(
            frame, conf=self._conf_threshold, classes=[PERSON_CLASS_ID], verbose=False
        )
        detections: list[Detection] = []
        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                score = float(box.conf[0])
                detections.append(Detection(int(x1), int(y1), int(x2), int(y2), score))
        return detections


class HogPersonDetector:
    """Repli OpenCV (HOG + SVM), sans poids à télécharger : plan B hors ligne."""

    def __init__(self, conf_threshold: float) -> None:
        import cv2

        self._hog = cv2.HOGDescriptor()
        self._hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
        self._conf_threshold = conf_threshold

    def detect(self, frame: np.ndarray) -> list[Detection]:
        rects, weights = self._hog.detectMultiScale(
            frame, winStride=(8, 8), padding=(8, 8), scale=1.05
        )
        detections: list[Detection] = []
        for (x, y, w, h), weight in zip(rects, weights):
            # Le score HOG (distance à la marge SVM) n'est pas une probabilité : on le
            # ramène sur 0..1 pour rester comparable au score de confiance YOLO.
            score = 1 / (1 + math.exp(-float(weight[0])))
            if score >= self._conf_threshold:
                detections.append(Detection(x, y, x + w, y + h, score))
        return detections


def build_detector(backend: str, model_path: str, conf_threshold: float) -> PersonDetector:
    if backend == "yolo":
        return YoloPersonDetector(model_path, conf_threshold)
    if backend == "hog":
        return HogPersonDetector(conf_threshold)
    raise ValueError(f"DETECTOR_BACKEND inconnu : {backend!r} (attendu: 'yolo' ou 'hog')")
