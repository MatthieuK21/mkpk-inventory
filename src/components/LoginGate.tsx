"use client";

import { FormEvent, useState } from "react";
import {
  browserSupportsWebAuthn,
  startAuthentication,
} from "@simplewebauthn/browser";
import type { AuthUser } from "@/lib/auth-types";
import { writeSession } from "@/lib/client-auth";

type Props = {
  onAuthenticated: (user: AuthUser, token: string) => void;
};

export default function LoginGate({ onAuthenticated }: Props) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const webauthnOk = browserSupportsWebAuthn();

  async function loginWithPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Connexion impossible");
      writeSession(json.token, json.user);
      onAuthenticated(json.user, json.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setBusy(false);
    }
  }

  async function loginWithBiometrics() {
    setBusy(true);
    setError(null);
    try {
      const optRes = await fetch("/api/auth/webauthn/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: login.trim() || undefined }),
      });
      const optJson = await optRes.json();
      if (!optRes.ok) throw new Error(optJson.error || "Biométrie indisponible");

      const assertion = await startAuthentication({
        optionsJSON: optJson.options,
      });

      const verifyRes = await fetch("/api/auth/webauthn/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: optJson.challengeId,
          response: assertion,
        }),
      });
      const verifyJson = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyJson.error || "Biométrie refusée");
      }
      writeSession(verifyJson.token, verifyJson.user);
      onAuthenticated(verifyJson.user, verifyJson.token);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Empreinte / Face ID indisponible",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="gate">
      <form className="gate-card" onSubmit={loginWithPassword}>
        <p className="brand">MKPK</p>
        <h1>Connexion</h1>
        <p className="muted">
          Identifiant, mot de passe, ou biométrie (empreinte / Face ID).
        </p>
        {error && <p className="error">{error}</p>}
        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="Identifiant"
          autoComplete="username"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          autoComplete="current-password"
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? "…" : "Entrer"}
        </button>
        {webauthnOk && (
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => void loginWithBiometrics()}
          >
            Empreinte / Face ID
          </button>
        )}
      </form>
    </main>
  );
}
