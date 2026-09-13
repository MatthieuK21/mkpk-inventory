"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  browserSupportsWebAuthn,
  startAuthentication,
} from "@simplewebauthn/browser";
import type { AuthUser } from "@/lib/auth-types";
import { writeSession } from "@/lib/client-auth";

type Props = {
  onAuthenticated: (user: AuthUser, token: string) => void;
};

const BIO_PREF_KEY = "mkpk_prefer_webauthn";

export default function LoginGate({ onAuthenticated }: Props) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const webauthnOk = browserSupportsWebAuthn();
  const autoTriedRef = useRef(false);

  async function loginWithBiometrics() {
    setBusy(true);
    setError(null);
    try {
      const optRes = await fetch("/api/auth/webauthn/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
      try {
        localStorage.setItem(BIO_PREF_KEY, "1");
      } catch {
        /* ignore */
      }
      writeSession(verifyJson.token, verifyJson.user);
      onAuthenticated(verifyJson.user, verifyJson.token);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Empreinte / Face ID indisponible";
      // Annulation utilisateur : ne pas crier
      if (/not allowed|abort|cancel|annul/i.test(message)) {
        setError(null);
      } else {
        setError(message);
        setShowCode(true);
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!webauthnOk || autoTriedRef.current) return;
    autoTriedRef.current = true;
    let prefer = false;
    try {
      prefer = localStorage.getItem(BIO_PREF_KEY) === "1";
    } catch {
      prefer = false;
    }
    if (prefer) {
      void loginWithBiometrics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot auto prompt
  }, [webauthnOk]);

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

  return (
    <main className="gate">
      <div className="gate-card gate-card-auth">
        <p className="brand">MKPK</p>
        <h1>Connexion</h1>
        <p className="muted gate-lead">
          {webauthnOk
            ? "Utilisez votre empreinte ou Face ID pour entrer."
            : "Cet appareil ne propose pas la biométrie. Connectez-vous avec votre code."}
        </p>
        {error && <p className="error">{error}</p>}

        {webauthnOk ? (
          <button
            type="button"
            className="gate-primary"
            disabled={busy}
            onClick={() => void loginWithBiometrics()}
          >
            {busy ? "Vérification…" : "Empreinte / Face ID"}
          </button>
        ) : null}

        <div className={`gate-code ${showCode || !webauthnOk ? "open" : ""}`}>
          {webauthnOk ? (
            <button
              type="button"
              className="gate-code-toggle"
              disabled={busy}
              onClick={() => setShowCode((v) => !v)}
            >
              {showCode ? "Masquer le code" : "Utiliser un code à la place"}
            </button>
          ) : null}

          {(showCode || !webauthnOk) && (
            <form className="gate-code-form" onSubmit={loginWithPassword}>
              <p className="muted gate-code-hint">
                Première connexion ou nouvel appareil : entrez votre identifiant
                et votre code, puis enregistrez l’empreinte / Face ID.
              </p>
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
                placeholder="Code / mot de passe"
                autoComplete="current-password"
                required
              />
              <button type="submit" className="gate-code-submit" disabled={busy}>
                {busy ? "…" : "Entrer avec le code"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
