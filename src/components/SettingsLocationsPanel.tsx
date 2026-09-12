"use client";

import { FormEvent, useEffect, useState } from "react";
import type { LocationRecord } from "@/lib/locations";
import { sessionHeaders } from "@/lib/client-auth";

type Props = {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
};

const emptyForm = { title: "", address: "" };

export default function SettingsLocationsPanel({
  open,
  onClose,
  onChanged,
}: Props) {
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadLocations() {
    const res = await fetch("/api/locations", { headers: sessionHeaders() });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Chargement des lieux");
    setLocations(json.locations ?? []);
  }

  useEffect(() => {
    if (!open) return;
    setError(null);
    setEditingId(null);
    setForm(emptyForm);
    void loadLocations().catch((err) =>
      setError(err instanceof Error ? err.message : "Erreur"),
    );
  }, [open]);

  function startEdit(loc: LocationRecord) {
    setEditingId(loc.id);
    setForm({ title: loc.title, address: loc.address ?? "" });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function saveLocation(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        address: form.address.trim() || null,
      };
      if (!payload.title) throw new Error("Le titre est obligatoire");

      const res = await fetch("/api/locations", {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders(),
        },
        body: JSON.stringify(
          editingId ? { id: editingId, ...payload } : payload,
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Enregistrement impossible");

      setForm(emptyForm);
      setEditingId(null);
      await loadLocations();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function removeLocation(loc: LocationRecord) {
    if (
      !confirm(
        `Supprimer le lieu « ${loc.title} » ?\nUniquement possible s’il n’a plus d’objet.`,
      )
    ) {
      return;
    }
    setError(null);
    const res = await fetch("/api/locations", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...sessionHeaders(),
      },
      body: JSON.stringify({ id: loc.id, title: loc.title }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Suppression impossible");
      return;
    }
    if (editingId === loc.id) cancelEdit();
    await loadLocations();
    onChanged();
  }

  if (!open) return null;

  return (
    <div className="modal" onClick={onClose}>
      <article
        className="sheet settings-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Paramètres · Lieux</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Fermer
          </button>
        </div>

        <p className="muted">
          Créez et modifiez ici les lieux (titre + adresse). Les formulaires
          d’objets ne permettent plus d’en inventer de nouveaux.
        </p>

        {error && <p className="error">{error}</p>}

        <form className="settings-form" onSubmit={saveLocation}>
          <h3>{editingId ? "Modifier le lieu" : "Nouveau lieu"}</h3>
          <label>
            Titre
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Maison, Cave…"
              required
            />
          </label>
          <label>
            Adresse
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="12 rue…, bâtiment B…"
              autoComplete="street-address"
            />
          </label>
          <div className="settings-form-actions">
            {editingId ? (
              <button type="button" className="ghost" onClick={cancelEdit}>
                Annuler
              </button>
            ) : null}
            <button type="submit" disabled={busy}>
              {busy ? "…" : editingId ? "Enregistrer" : "Créer le lieu"}
            </button>
          </div>
        </form>

        <section className="settings-list">
          <h3>Lieux enregistrés</h3>
          {locations.length === 0 ? (
            <p className="muted">Aucun lieu pour le moment.</p>
          ) : (
            <ul className="settings-location-list">
              {locations.map((loc) => (
                <li key={loc.id} className="settings-location-card">
                  <div>
                    <strong>{loc.title}</strong>
                    {loc.address ? (
                      <p className="muted settings-location-address">
                        {loc.address}
                      </p>
                    ) : (
                      <p className="muted settings-location-address">
                        Pas d’adresse
                      </p>
                    )}
                    <p className="muted">
                      {loc.item_count ?? 0} objet
                      {(loc.item_count ?? 0) > 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="settings-location-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => startEdit(loc)}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={() => void removeLocation(loc)}
                    >
                      Supprimer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </div>
  );
}
