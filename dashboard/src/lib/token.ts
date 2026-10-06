"use client";

import { useSyncExternalStore } from "react";

// Jeton opérateur en sessionStorage (contrat §5.3) : effacé à la fermeture de l'onglet,
// jamais présent dans le code source. Le stockage peut être indisponible (navigation privée…).

const KEY = "sentinel.operatorToken";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function saveToken(token: string): void {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // Stockage indisponible : le jeton ne survivra pas au rechargement
  }
  notify();
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Rien à effacer
  }
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `undefined` pendant le rendu statique (avant lecture du navigateur), puis le jeton ou `null`. */
export function useOperatorToken(): string | null | undefined {
  return useSyncExternalStore(subscribe, read, () => undefined);
}
