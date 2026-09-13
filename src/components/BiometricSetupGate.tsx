"use client";

import { useState } from "react";
import {
  browserSupportsWebAuthn,
  startRegistration,
} from "@simplewebauthn/browser";
import type { AuthUser } from "@/lib/auth-types";
import {
  readSessionToken,
  sessionHeaders,
  writeSession,
} from "@/lib/client-auth";

type Props = {
  user: AuthUser;
  onRegistered: (user: AuthUser) => void;
  onSkip: () => void;
};

const BIO_PREF_KEY = "mkpk_prefer_webauthn";

export default function BiometricSetupGate({
  user,
  onRegistered,
  onSkip,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const webauthnOk = browserSupportsWebAuthn();

  async function registerBiometrics() {
    if (!webauthnOk) {
      setError("Biométrie non supportée sur cet appareil");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const optRes = await fetch("/api/auth/webauthn/register/options", {
        method: "POST",
        headers: sessionHeaders(),
      });
      const optJson = await optRes.json();
      if (!optRes.ok) throw new Error(optJson.error || "Options biométrie");

      const attestation = await startRegistration({
        optionsJSON: optJson.options,
      });

      const verifyRes = await fetch("/api/auth/webauthn/register/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders(),
        },
        body: JSON.stringify({
          challengeId: optJson.challengeId,
          response: attestation,
        }),
      });
      const verifyJson = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyJson.error || "Échec enregistrement biométrie");
      }

      const nextUser: AuthUser =
        verifyJson.user ?? { ...user, has_webauthn: true };
      try {
        localStorage.setItem(BIO_PREF_KEY, "1");
      } catch {
        /* ignore */
      }
      writeSession(readSessionToken(), nextUser);
      onRegistered(nextUser);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erreur empreinte / Face ID";
      if (/not allowed|abort|cancel|annul/i.test(message)) {
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="gate">
      <div className="gate-card gate-card-auth">
        <p className="brand">MKPK</p>
        <h1>Activer l’accès rapide</h1>
        <p className="muted gate-lead">
          Bonjour {user.name}. Pour les prochaines fois, enregistrez votre
          empreinte ou Face ID — ce sera votre moyen de connexion principal.
        </p>
        {error && <p className="error">{error}</p>}

        {webauthnOk ? (
          <button
            type="button"
            className="gate-primary"
            disabled={busy}
            onClick={() => void registerBiometrics()}
          >
            {busy ? "Enregistrement…" : "Enregistrer empreinte / Face ID"}
          </button>
        ) : (
          <p className="muted">
            Cet appareil ne permet pas la biométrie. Vous pourrez l’activer plus
            tard depuis un téléphone compatible.
          </p>
        )}

        <button
          type="button"
          className="gate-code-toggle"
          disabled={busy}
          onClick={onSkip}
        >
          Continuer sans biométrie pour l’instant
        </button>
      </div>
    </main>
  );
}
