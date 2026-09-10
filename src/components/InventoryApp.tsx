"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { Category, InventoryItem } from "@/lib/types";

const PASSWORD_KEY = "mkpk-inventory-password";

function authHeaders(password: string): HeadersInit {
  return password ? { "x-inventory-password": password } : {};
}

export default function InventoryApp() {
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<InventoryItem | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [categoryId, setCategoryId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(PASSWORD_KEY) ?? "";
    if (saved) setPassword(saved);

    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setPasswordRequired(Boolean(data.passwordRequired));
        setConfigured(Boolean(data.configured));
        if (!data.passwordRequired) {
          setUnlocked(true);
        } else if (saved) {
          setUnlocked(true);
        }
      })
      .catch(() => setConfigured(false));
  }, []);

  async function loadData(pwd = password) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (categoryFilter) params.set("category", categoryFilter);

      const [catRes, itemRes] = await Promise.all([
        fetch("/api/categories", { headers: authHeaders(pwd) }),
        fetch(`/api/items?${params}`, { headers: authHeaders(pwd) }),
      ]);

      if (catRes.status === 401 || itemRes.status === 401) {
        setUnlocked(false);
        sessionStorage.removeItem(PASSWORD_KEY);
        throw new Error("Mot de passe incorrect");
      }

      const catJson = await catRes.json();
      const itemJson = await itemRes.json();

      if (!catRes.ok) throw new Error(catJson.error || "Erreur catégories");
      if (!itemRes.ok) throw new Error(itemJson.error || "Erreur inventaire");

      setCategories(catJson.categories ?? []);
      setItems(itemJson.items ?? []);
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!unlocked || !configured) return;
    const t = setTimeout(() => {
      void loadData();
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, configured, query, categoryFilter]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const hasFilters = Boolean(query.trim() || categoryFilter);

  function unlock(e: FormEvent) {
    e.preventDefault();
    sessionStorage.setItem(PASSWORD_KEY, password);
    setUnlocked(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || !name.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("name", name.trim());
      form.set("description", description.trim());
      form.set("location", location.trim());
      form.set("quantity", String(quantity));
      if (categoryId) form.set("category_id", categoryId);

      const res = await fetch("/api/items", {
        method: "POST",
        headers: authHeaders(password),
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Échec de l'enregistrement");

      setName("");
      setDescription("");
      setLocation("");
      setQuantity(1);
      setCategoryId("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(password),
        },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Impossible d'ajouter la catégorie");
      setNewCategoryName("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur catégorie");
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("Supprimer cet objet de l'inventaire ?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: "DELETE",
        headers: authHeaders(password),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Suppression impossible");
      setSelected(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur suppression");
    }
  }

  if (!configured) {
    return (
      <main className="setup">
        <h1>MKPK Inventaire</h1>
        <p>
          Configurez <code>SUPABASE_URL</code> et{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code>, puis exécutez le SQL dans{" "}
          <code>supabase/schema.sql</code>.
        </p>
      </main>
    );
  }

  if (passwordRequired && !unlocked) {
    return (
      <main className="gate">
        <form className="gate-card" onSubmit={unlock}>
          <p className="brand">MKPK</p>
          <h1>Inventaire</h1>
          <p className="muted">Entrez le mot de passe pour accéder.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            autoFocus
            required
          />
          <button type="submit">Entrer</button>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="hero">
        <div>
          <p className="brand">MKPK</p>
          <h1>Inventaire photo</h1>
          <p className="muted">
            Uploadez, classez et retrouvez vos objets en un coup d’œil.
          </p>
        </div>
        <div className="stat">
          <strong>{items.length}</strong>
          <span>objet{items.length > 1 ? "s" : ""}</span>
        </div>
      </header>

      {error && <p className="error banner">{error}</p>}

      <section className="panel upload">
        <h2>Ajouter un objet</h2>
        <form onSubmit={onSubmit} className="upload-form">
          <label
            className={`dropzone ${preview ? "has-preview" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const dropped = e.dataTransfer.files?.[0];
              if (dropped?.type.startsWith("image/")) setFile(dropped);
            }}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Aperçu" />
            ) : (
              <span>
                Glissez une photo ici
                <br />
                ou cliquez pour choisir
              </span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>

          <div className="fields">
            <label>
              Nom
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Canapé 3 places"
                required
              />
            </label>
            <label>
              Catégorie
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Sans catégorie</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Lieu
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex. Salon, Cave, Garage"
              />
            </label>
            <label>
              Quantité
              <input
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
            <label className="full">
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notes, état, numéro de série…"
                rows={3}
              />
            </label>
            <button type="submit" disabled={saving || !file || !name.trim()}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="toolbar">
          <h2>Galerie</h2>
          <div className="filters">
            <label className="filter-field">
              <span>Catégorie</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">Toutes les catégories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Recherche</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom, lieu, description…"
              />
            </label>
            {hasFilters && (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setQuery("");
                  setCategoryFilter("");
                }}
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>

        <form className="new-cat" onSubmit={addCategory}>
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Nouvelle catégorie"
          />
          <button type="submit">Ajouter</button>
        </form>

        {loading ? (
          <p className="muted">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="muted empty">
            {hasFilters
              ? "Aucun objet ne correspond à ces filtres."
              : "Aucun objet pour le moment."}
          </p>
        ) : (
          <div className="grid">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="card"
                onClick={() => setSelected(item)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image_url} alt={item.name} loading="lazy" />
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.category?.name ?? "Sans catégorie"}
                    {item.location ? ` · ${item.location}` : ""}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <div className="modal" onClick={() => setSelected(null)}>
          <article onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.image_url} alt={selected.name} />
            <div className="modal-body">
              <h3>{selected.name}</h3>
              <p>
                <span
                  className="tag"
                  style={{
                    background: selected.category?.color ?? "#6B7280",
                  }}
                >
                  {selected.category?.name ?? "Sans catégorie"}
                </span>
              </p>
              {selected.location && <p>Lieu : {selected.location}</p>}
              <p>Quantité : {selected.quantity}</p>
              {selected.description && <p>{selected.description}</p>}
              <div className="modal-actions">
                <button type="button" onClick={() => setSelected(null)}>
                  Fermer
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => void deleteItem(selected.id)}
                >
                  Supprimer
                </button>
              </div>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}
