"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  browserSupportsWebAuthn,
  startRegistration,
} from "@simplewebauthn/browser";
import type { AdminUser } from "@/lib/auth-types";
import { sessionHeaders } from "@/lib/client-auth";

type Props = {
  open: boolean;
  onClose: () => void;
  knownLocations: string[];
};

const emptyForm = {
  name: "",
  login: "",
  password: "",
  role: "user" as "admin" | "user",
  locationsText: "",
};

export default function AdminUsersPanel({
  open,
  onClose,
  knownLocations,
}: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [bioMsg, setBioMsg] = useState<string | null>(null);

  async function loadUsers() {
    const res = await fetch("/api/admin/users", { headers: sessionHeaders() });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Chargement utilisateurs");
    setUsers(json.users ?? []);
  }

  useEffect(() => {
    if (!open) return;
    void loadUsers().catch((err) =>
      setError(err instanceof Error ? err.message : "Erreur"),
    );
  }, [open]);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const locations = form.locationsText
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders(),
        },
        body: JSON.stringify({
          name: form.name,
          login: form.login,
          password: form.password,
          role: form.role,
          locations,
          must_change_password: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Création impossible");
      setForm(emptyForm);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(id: string) {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "DELETE",
      headers: sessionHeaders(),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Suppression impossible");
      return;
    }
    await loadUsers();
  }

  async function saveLocations(user: AdminUser, locationsText: string) {
    setError(null);
    const locations = locationsText
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...sessionHeaders(),
      },
      body: JSON.stringify({ locations }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Mise à jour impossible");
      return;
    }
    await loadUsers();
  }

  async function resetPassword(user: AdminUser) {
    const password = prompt(`Nouveau mot de passe pour ${user.name}`);
    if (!password) return;
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...sessionHeaders(),
      },
      body: JSON.stringify({ password, must_change_password: true }),
    });
    const json = await res.json();
    if (!res.ok) setError(json.error || "Mot de passe non modifié");
    else setBioMsg(`Mot de passe mis à jour pour ${user.name}`);
  }

  async function registerBiometrics() {
    if (!browserSupportsWebAuthn()) {
      setBioMsg("Biométrie non supportée sur cet appareil");
      return;
    }
    setBioMsg(null);
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
      if (!verifyRes.ok) throw new Error(verifyJson.error || "Échec biométrie");
      setBioMsg("Empreinte / Face ID enregistrés pour votre compte");
      await loadUsers();
    } catch (err) {
      setBioMsg(err instanceof Error ? err.message : "Erreur biométrie");
    }
  }

  if (!open) return null;

  return (
    <div className="modal" onClick={onClose}>
      <article className="sheet admin-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Utilisateurs & droits</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Fermer
          </button>
        </div>

        {error && <p className="error">{error}</p>}
        {bioMsg && <p className="muted">{bioMsg}</p>}

        <section className="admin-block">
          <h3>Votre biométrie</h3>
          <button type="button" onClick={() => void registerBiometrics()}>
            Enregistrer empreinte / Face ID
          </button>
        </section>

        <section className="admin-block">
          <h3>Créer un utilisateur</h3>
          <form className="admin-form" onSubmit={createUser}>
            <input
              placeholder="Nom affiché"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              placeholder="Identifiant"
              value={form.login}
              onChange={(e) => setForm({ ...form, login: e.target.value })}
              required
            />
            <input
              type="password"
              placeholder="Mot de passe provisoire"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <select
              value={form.role}
              onChange={(e) =>
                setForm({
                  ...form,
                  role: e.target.value === "admin" ? "admin" : "user",
                })
              }
            >
              <option value="user">Utilisateur</option>
              <option value="admin">Administrateur</option>
            </select>
            <input
              placeholder="Lieux autorisés (séparés par des virgules)"
              value={form.locationsText}
              onChange={(e) =>
                setForm({ ...form, locationsText: e.target.value })
              }
              list="admin-known-locations"
            />
            <datalist id="admin-known-locations">
              {knownLocations.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
            <button type="submit" disabled={busy}>
              Créer
            </button>
          </form>
        </section>

        <section className="admin-block">
          <h3>Comptes</h3>
          <ul className="admin-user-list">
            {users.map((user) => (
              <li key={user.id} className="admin-user-card">
                <div>
                  <strong>{user.name}</strong>
                  <span className="muted">
                    {" "}
                    · {user.login} · {user.role}
                    {!user.active ? " · inactif" : ""}
                    {user.webauthn_count
                      ? ` · biométrie ×${user.webauthn_count}`
                      : ""}
                  </span>
                </div>
                {user.role !== "admin" && (
                  <label className="admin-locations">
                    Lieux
                    <input
                      defaultValue={user.locations.join(", ")}
                      key={`${user.id}-${user.locations.join("|")}`}
                      onBlur={(e) =>
                        void saveLocations(user, e.target.value)
                      }
                      placeholder="Cave, Grenier…"
                    />
                  </label>
                )}
                <div className="admin-actions">
                  <button type="button" className="ghost" onClick={() => void resetPassword(user)}>
                    Mot de passe
                  </button>
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => void removeUser(user.id)}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </div>
  );
}
