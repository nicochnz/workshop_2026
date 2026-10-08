from __future__ import annotations

import threading
import time

import cv2
import numpy as np
from flask import Flask, Response


class MjpegStream:
    """Tampon thread-safe de la dernière frame annotée, servi en MJPEG (contrat §6).

    GET /video_feed — même route et résolution (640x480 max) qu'attend le composant
    VideoFeed du dashboard.
    """

    def __init__(self, target_fps: int = 15) -> None:
        self._lock = threading.Lock()
        self._jpeg: bytes | None = None
        self._min_interval = 1.0 / target_fps

    def update(self, frame: np.ndarray) -> None:
        ok, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if not ok:
            return
        with self._lock:
            self._jpeg = buffer.tobytes()

    def _frames(self):
        while True:
            with self._lock:
                jpeg = self._jpeg
            if jpeg is not None:
                yield (
                    b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
                )
            time.sleep(self._min_interval)

    def build_app(self) -> Flask:
        app = Flask(__name__)

        @app.get("/health")
        def health():
            return {"status": "ok"}

        @app.get("/video_feed")
        def video_feed():
            return Response(
                self._frames(), mimetype="multipart/x-mixed-replace; boundary=frame"
            )

        return app
