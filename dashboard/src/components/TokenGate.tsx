"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, fetchStatus } from "@/lib/api";
import { saveToken } from "@/lib/token";

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Erreur inattendue.";
  if (error.status === 401 || error.status === 403) return "Jeton refusé par l'API.";
  if (error.status === 0) return "API injoignable. Vérifiez qu'elle est démarrée.";
  if (error.status === 429) return "Trop de tentatives, patientez une minute.";
  return error.message;
}

// Écran d'accès : le jeton est vérifié auprès de l'API avant d'être enregistré.
export function TokenGate() {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = token.trim();
    if (!value) return;

    setChecking(true);
    setError(null);
    try {
      await fetchStatus(value);
      saveToken(value);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="neon-panel w-full max-w-md rounded-xl p-6" noValidate>
        <h1 className="mb-1 font-mono text-2xl font-bold tracking-[0.2em]">
          <span className="neon-glow text-info">SENTINEL</span>
          <span className="neon-glow text-ok">-X</span>
        </h1>
        <p className="mb-6 font-mono text-xs tracking-[0.25em] text-muted uppercase">Accès opérateur</p>

        <label htmlFor="token" className="mb-2 block text-sm font-medium text-fg">
          Jeton opérateur
        </label>
        <input
          id="token"
          type="password"
          autoComplete="off"
          autoFocus
          value={token}
          onChange={(e) => setToken(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? "token-error" : "token-help"}
          className="w-full rounded-lg border border-line bg-deep px-3 py-2 font-mono text-fg placeholder:text-muted focus:border-info"
          placeholder="OPERATOR_TOKEN"
        />
        <p id="token-help" className="mt-2 text-xs text-muted">
          Gardé uniquement le temps de cet onglet.
        </p>

        {error && (
          <p id="token-error" role="alert" className="mt-3 rounded-lg border border-crit/60 bg-crit/10 px-3 py-2 text-sm text-crit">
            ⚠ {error}
          </p>
        )}

        <button
          type="submit"
          disabled={checking || !token.trim()}
          className="mt-6 w-full rounded-lg bg-ok px-4 py-2 font-mono font-bold tracking-widest text-deep uppercase shadow-[0_0_20px_-4px_var(--color-ok)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checking ? "Vérification…" : "Connexion"}
        </button>
      </form>
    </main>
  );
}
