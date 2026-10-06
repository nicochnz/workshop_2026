"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { wsUrl } from "@/lib/config";
import type { LiveMessage } from "@/lib/types";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "unauthorized";

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 10_000;
const CLOSE_UNAUTHORIZED = 4401; // contrat §5.1

interface Handlers {
  onReady: () => void;
  onMessage: (message: Exclude<LiveMessage, { event: "ready" }>) => void;
  onUnauthorized: () => void;
}

function parse(raw: unknown): LiveMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const message = JSON.parse(raw) as { event?: unknown };
    return typeof message.event === "string" ? (message as LiveMessage) : null;
  } catch {
    return null;
  }
}

/**
 * WebSocket temps réel (contrat §5) : authentification au premier message,
 * reconnexion automatique avec délai croissant (1 s → 10 s), arrêt définitif sur jeton refusé.
 */
export function useLiveSocket(token: string, handlers: Handlers): ConnectionState {
  const [state, setState] = useState<ConnectionState>("connecting");

  // Toujours les derniers handlers, sans rouvrir la connexion à chaque rendu
  const onReady = useEffectEvent(handlers.onReady);
  const onMessage = useEffectEvent(handlers.onMessage);
  const onUnauthorized = useEffectEvent(handlers.onUnauthorized);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let disposed = false;

    const connect = () => {
      socket = new WebSocket(wsUrl());

      socket.onopen = () => socket?.send(JSON.stringify({ type: "auth", token }));

      socket.onmessage = (event) => {
        const message = parse(event.data);
        if (!message) return;
        if (message.event === "ready") {
          attempt = 0;
          setState("live");
          onReady();
        } else {
          onMessage(message);
        }
      };

      socket.onclose = (event) => {
        if (disposed) return;
        if (event.code === CLOSE_UNAUTHORIZED) {
          setState("unauthorized");
          onUnauthorized();
          return;
        }
        setState("reconnecting");
        const delay = Math.min(RETRY_MIN_MS * 2 ** attempt, RETRY_MAX_MS);
        attempt++;
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      socket?.close(1000);
    };
  }, [token]);

  return state;
}
