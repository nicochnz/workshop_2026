"use client";

import { useState } from "react";
import { videoUrl } from "@/lib/config";

// Flux MJPEG annoté par l'IA (contrat §6). Servi par le script IA, pas par l'API.
export function VideoFeed() {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = `${videoUrl()}${attempt ? `?retry=${attempt}` : ""}`;

  const retry = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };

  return (
    <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-line bg-deep">
      {failed ? (
        <div role="status" className="flex flex-col items-center gap-3 p-4 text-center">
          <p className="font-mono text-warn">▲ Flux vidéo indisponible</p>
          <p className="text-sm text-muted">Le script IA doit diffuser sur {videoUrl()}</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg border border-info/70 px-3 py-2 font-mono text-sm text-info transition hover:brightness-125"
          >
            Réessayer
          </button>
        </div>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- flux MJPEG externe, next/image inadapté */}
          <img
            key={attempt}
            src={src}
            alt="Webcam du poste serveur, annotée par l'IA de détection"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain"
          />
          <span className="absolute top-2 left-2 rounded bg-deep/80 px-2 py-0.5 font-mono text-xs text-crit">● LIVE</span>
        </>
      )}
    </div>
  );
}
