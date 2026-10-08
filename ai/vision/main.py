from __future__ import annotations

import logging
import threading
import time

import cv2
import numpy as np

from .alerts import AlertPublisher
from .config import Config, load_config
from .detector import Detection, PersonDetector, build_detector
from .stream import MjpegStream

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
logger = logging.getLogger("vision.main")


def annotate(frame: np.ndarray, detections: list[Detection], elapsed_ms: float) -> np.ndarray:
    for det in detections:
        cv2.rectangle(frame, (det.x1, det.y1), (det.x2, det.y2), (0, 0, 255), 2)
        cv2.putText(
            frame,
            f"INTRUS {det.score:.0%}",
            (det.x1, max(det.y1 - 8, 12)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 0, 255),
            2,
        )
    budget_color = (0, 200, 0) if elapsed_ms <= 100 else (0, 140, 255)
    cv2.putText(
        frame, f"{elapsed_ms:.0f} ms", (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, budget_color, 1
    )
    return frame


def capture_loop(
    config: Config, detector: PersonDetector, publisher: AlertPublisher, stream: MjpegStream
) -> None:
    capture = cv2.VideoCapture(config.camera_index)
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, config.frame_width)
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, config.frame_height)
    if not capture.isOpened():
        raise RuntimeError(f"Webcam introuvable (index {config.camera_index})")

    logger.info(
        "Webcam ouverte (index=%s, %sx%s, backend=%s)",
        config.camera_index,
        config.frame_width,
        config.frame_height,
        config.detector_backend,
    )

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                logger.warning("Frame illisible, nouvelle tentative")
                time.sleep(0.1)
                continue

            # Bridage/redimensionnement systématique (cf. spécification "Optimisation des Flux")
            if frame.shape[1] != config.frame_width or frame.shape[0] != config.frame_height:
                frame = cv2.resize(frame, (config.frame_width, config.frame_height))

            start = time.perf_counter()
            detections = detector.detect(frame)
            elapsed_ms = (time.perf_counter() - start) * 1000

            if elapsed_ms > config.max_frame_ms:
                logger.warning(
                    "Frame traitée en %.0f ms (> %.0f ms cible)", elapsed_ms, config.max_frame_ms
                )

            stream.update(annotate(frame, detections, elapsed_ms))

            if detections:
                best = max(detections, key=lambda d: d.score)
                publisher.maybe_publish(best)
    finally:
        capture.release()


def main() -> None:
    config = load_config()
    detector = build_detector(config.detector_backend, config.model_path, config.conf_threshold)
    publisher = AlertPublisher(config)
    stream = MjpegStream()

    app = stream.build_app()
    server_thread = threading.Thread(
        target=lambda: app.run(
            host=config.stream_host, port=config.stream_port, threaded=True
        ),
        daemon=True,
    )
    server_thread.start()
    logger.info(
        "Flux MJPEG disponible sur http://%s:%s/video_feed", config.stream_host, config.stream_port
    )

    capture_loop(config, detector, publisher, stream)


if __name__ == "__main__":
    main()
