"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import { EffectCoverflow, Keyboard, Mousewheel } from "swiper/modules";
import "swiper/css";
import "swiper/css/effect-coverflow";
import type {
  AppUser,
  Category,
  InventoryItem,
  ItemComment,
  ItemHistoryEntry,
  ItemOwner,
} from "@/lib/types";
import { ITEM_OWNERS } from "@/lib/types";
import {
  fieldLabel,
  formatHistoryValue,
  formatPrice,
} from "@/lib/history";

const PASSWORD_KEY = "mkpk-inventory-password";
const USER_KEY = "mkpk-inventory-user";

type Draft = {
  name: string;
  description: string;
  location: string;
  quantity: number;
  category_id: string;
  estimated_price: string;
  owner: ItemOwner | "";
};

function authHeaders(password: string): HeadersInit {
  return password ? { "x-inventory-password": password } : {};
}

function loadStoredUser(): AppUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AppUser) : null;
  } catch {
    return null;
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function draftFromItem(item: InventoryItem): Draft {
  return {
    name: item.name,
    description: item.description ?? "",
    location: item.location ?? "",
    quantity: item.quantity,
    category_id: item.category_id ?? "",
    estimated_price:
      item.estimated_price === null || item.estimated_price === undefined
        ? ""
        : String(item.estimated_price),
    owner: item.owner ?? "",
  };
}

function isDraftDirty(item: InventoryItem, draft: Draft) {
  const base = draftFromItem(item);
  return JSON.stringify(base) !== JSON.stringify(draft);
}

export default function InventoryApp() {
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [showAdd, setShowAdd] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [newUserName, setNewUserName] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [estimatedPrice, setEstimatedPrice] = useState("");
  const [owner, setOwner] = useState<ItemOwner | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [comments, setComments] = useState<ItemComment[]>([]);
  const [history, setHistory] = useState<ItemHistoryEntry[]>([]);
  const [commentText, setCommentText] = useState("");

  const swiperRef = useRef<SwiperType | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const addSavingRef = useRef(false);
  const editSavingRef = useRef(false);

  const detailItem = detailId
    ? (items.find((item) => item.id === detailId) ?? null)
    : null;

  useEffect(() => {
    const saved = sessionStorage.getItem(PASSWORD_KEY) ?? "";
    if (saved) setPassword(saved);
    setCurrentUser(loadStoredUser());

    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setPasswordRequired(Boolean(data.passwordRequired));
        setConfigured(Boolean(data.configured));
        if (!data.passwordRequired || saved) setUnlocked(true);
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
      if (ownerFilter) params.set("owner", ownerFilter);

      const [catRes, itemRes, userRes, locRes] = await Promise.all([
        fetch("/api/categories", { headers: authHeaders(pwd) }),
        fetch(`/api/items?${params}`, { headers: authHeaders(pwd) }),
        fetch("/api/users", { headers: authHeaders(pwd) }),
        fetch("/api/locations", { headers: authHeaders(pwd) }),
      ]);

      if ([catRes, itemRes, userRes, locRes].some((r) => r.status === 401)) {
        setUnlocked(false);
        sessionStorage.removeItem(PASSWORD_KEY);
        throw new Error("Mot de passe incorrect");
      }

      const [catJson, itemJson, userJson, locJson] = await Promise.all([
        catRes.json(),
        itemRes.json(),
        userRes.json(),
        locRes.json(),
      ]);

      if (!catRes.ok) throw new Error(catJson.error || "Erreur catégories");
      if (!itemRes.ok) throw new Error(itemJson.error || "Erreur inventaire");
      if (!userRes.ok) throw new Error(userJson.error || "Erreur utilisateurs");
      if (!locRes.ok) throw new Error(locJson.error || "Erreur lieux");

      const nextItems: InventoryItem[] = itemJson.items ?? [];
      setCategories(catJson.categories ?? []);
      setLocations(locJson.locations ?? []);
      setItems(nextItems);
      setUsers(userJson.users ?? []);
      setUnlocked(true);
      setActiveIndex((i) =>
        nextItems.length === 0 ? 0 : Math.min(i, nextItems.length - 1),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!unlocked || !configured) return;
    if (!currentUser) {
      void (async () => {
        try {
          const res = await fetch("/api/users", {
            headers: authHeaders(password),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Erreur utilisateurs");
          setUsers(json.users ?? []);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Erreur utilisateurs");
        }
      })();
      return;
    }
    const t = setTimeout(() => void loadData(), 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, configured, currentUser, query, categoryFilter, ownerFilter]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!detailItem) {
      setDraft(null);
      return;
    }
    setDraft(draftFromItem(detailItem));
    setCommentText("");
    void (async () => {
      try {
        const [cRes, hRes] = await Promise.all([
          fetch(`/api/items/${detailItem.id}/comments`, {
            headers: authHeaders(password),
          }),
          fetch(`/api/items/${detailItem.id}/history`, {
            headers: authHeaders(password),
          }),
        ]);
        const cJson = await cRes.json();
        const hJson = await hRes.json();
        if (cRes.ok) setComments(cJson.comments ?? []);
        if (hRes.ok) setHistory(hJson.history ?? []);
      } catch {
        /* ignore */
      }
    })();
  }, [detailItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save édition
  useEffect(() => {
    if (!detailItem || !draft || !currentUser) return;
    if (!isDraftDirty(detailItem, draft) || !draft.name.trim()) return;
    if (editSavingRef.current) return;

    const t = setTimeout(() => {
      void saveItem(detailItem.id, draft);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, detailItem?.id]);

  // Auto-save création (photo + nom)
  useEffect(() => {
    if (!showAdd || !file || !name.trim() || !currentUser) return;
    if (addSavingRef.current) return;

    const t = setTimeout(() => {
      void createItem();
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showAdd,
    file,
    name,
    description,
    location,
    quantity,
    categoryId,
    estimatedPrice,
    owner,
  ]);

  function connectAs(user: AppUser) {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    setCurrentUser(user);
  }

  function disconnect() {
    sessionStorage.removeItem(USER_KEY);
    setCurrentUser(null);
  }

  function resetAdd() {
    setName("");
    setDescription("");
    setLocation("");
    setQuantity(1);
    setEstimatedPrice("");
    setOwner("");
    setCategoryId("");
    setFile(null);
    addSavingRef.current = false;
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function closeAdd() {
    setShowAdd(false);
    resetAdd();
    setSaveStatus("idle");
  }

  function onCameraPick(selected: File | null) {
    if (!selected) return;
    setFile(selected);
    setShowAdd(true);
    addSavingRef.current = false;
  }

  async function createItem() {
    if (!file || !name.trim() || !currentUser || addSavingRef.current) return;
    addSavingRef.current = true;
    setSaveStatus("saving");
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("name", name.trim());
      form.set("description", description.trim());
      form.set("location", location.trim());
      form.set("quantity", String(quantity));
      form.set("user_id", currentUser.id);
      if (estimatedPrice.trim()) form.set("estimated_price", estimatedPrice.trim());
      if (owner) form.set("owner", owner);
      if (categoryId) form.set("category_id", categoryId);

      const res = await fetch("/api/items", {
        method: "POST",
        headers: authHeaders(password),
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Échec de l'enregistrement");

      setSaveStatus("saved");
      closeAdd();
      await loadData();
      setActiveIndex(0);
      requestAnimationFrame(() => swiperRef.current?.slideTo(0));
    } catch (err) {
      addSavingRef.current = false;
      setSaveStatus("idle");
      setError(err instanceof Error ? err.message : "Erreur d'enregistrement");
    }
  }

  async function saveItem(itemId: string, current: Draft) {
    if (editSavingRef.current || !current.name.trim()) return;
    editSavingRef.current = true;
    setSaveStatus("saving");
    setError(null);
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(password),
        },
        body: JSON.stringify({
          name: current.name.trim(),
          description: current.description,
          location: current.location,
          quantity: current.quantity,
          category_id: current.category_id || null,
          estimated_price: current.estimated_price,
          owner: current.owner || null,
          user_id: currentUser?.id ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Échec de la mise à jour");

      setItems((prev) =>
        prev.map((item) => (item.id === itemId ? json.item : item)),
      );
      setDraft(draftFromItem(json.item));
      setSaveStatus("saved");
      const hRes = await fetch(`/api/items/${itemId}/history`, {
        headers: authHeaders(password),
      });
      const hJson = await hRes.json();
      if (hRes.ok) setHistory(hJson.history ?? []);
      setTimeout(() => setSaveStatus("idle"), 1200);
    } catch (err) {
      setSaveStatus("idle");
      setError(err instanceof Error ? err.message : "Erreur de mise à jour");
    } finally {
      editSavingRef.current = false;
    }
  }

  async function addComment() {
    if (!detailItem || !currentUser || !commentText.trim()) return;
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/items/${detailItem.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(password),
        },
        body: JSON.stringify({
          user_id: currentUser.id,
          body: commentText.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Échec du commentaire");
      setComments((prev) => [...prev, json.comment]);
      setCommentText("");
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1000);
    } catch (err) {
      setSaveStatus("idle");
      setError(err instanceof Error ? err.message : "Erreur commentaire");
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("Supprimer cet objet ?")) return;
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: "DELETE",
        headers: authHeaders(password),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Suppression impossible");
      setDetailId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur suppression");
    }
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    if (!newUserName.trim()) return;
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(password),
        },
        body: JSON.stringify({ name: newUserName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Impossible de créer le profil");
      setNewUserName("");
      connectAs(json.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur utilisateur");
    }
  }

  if (!configured) {
    return (
      <main className="gate">
        <div className="gate-card">
          <p className="brand">MKPK</p>
          <h1>Config requise</h1>
          <p className="muted">Variables Supabase manquantes.</p>
        </div>
      </main>
    );
  }

  if (passwordRequired && !unlocked) {
    return (
      <main className="gate">
        <form
          className="gate-card"
          onSubmit={(e) => {
            e.preventDefault();
            sessionStorage.setItem(PASSWORD_KEY, password);
            setUnlocked(true);
          }}
        >
          <p className="brand">MKPK</p>
          <h1>Inventaire</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            autoFocus
            required
          />
          <button type="submit">Entrer</button>
        </form>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="gate">
        <div className="gate-card">
          <p className="brand">MKPK</p>
          <h1>Qui êtes-vous ?</h1>
          {error && <p className="error">{error}</p>}
          <div className="user-list">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                className="user-chip"
                onClick={() => connectAs(user)}
              >
                {user.name}
              </button>
            ))}
          </div>
          <form className="new-user" onSubmit={createUser}>
            <input
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="Nouveau profil"
              required
            />
            <button type="submit">Entrer</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="menubar">
        <span className="brand menubar-brand">MKPK</span>
        <input
          className="menubar-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher…"
        />
        <select
          className="menubar-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Catégorie"
        >
          <option value="">Catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="menubar-select"
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          aria-label="Propriétaire"
        >
          <option value="">Propriétaires</option>
          {ITEM_OWNERS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span className="menubar-meta" aria-live="polite">
          {saveStatus === "saving"
            ? "…"
            : saveStatus === "saved"
              ? "OK"
              : items.length}
        </span>
        <button type="button" className="menubar-user" onClick={disconnect}>
          {currentUser.name}
        </button>
      </header>

      {error && <p className="error banner menubar-error">{error}</p>}

      <datalist id="known-locations">
        {locations.map((loc) => (
          <option key={loc} value={loc} />
        ))}
      </datalist>

      {loading ? (
        <p className="muted stage-msg stage-fill">Chargement…</p>
      ) : items.length === 0 ? (
        <div className="empty-state stage-fill">
          <p className="muted">Aucun objet. Prenez une photo pour commencer.</p>
        </div>
      ) : (
        <section className="coverflow-stage stage-fill">
          <Swiper
            modules={[EffectCoverflow, Keyboard, Mousewheel]}
            effect="coverflow"
            grabCursor
            centeredSlides
            slidesPerView="auto"
            initialSlide={activeIndex}
            keyboard={{ enabled: true }}
            mousewheel={{ forceToAxis: true, sensitivity: 1, releaseOnEdges: true }}
            coverflowEffect={{
              rotate: 24,
              stretch: 0,
              depth: 160,
              modifier: 1.1,
              slideShadows: true,
            }}
            onSwiper={(swiper) => {
              swiperRef.current = swiper;
            }}
            onSlideChange={(swiper) => setActiveIndex(swiper.activeIndex)}
            className="coverflow-swiper"
          >
            {items.map((item) => (
              <SwiperSlide key={item.id} className="coverflow-slide">
                <button
                  type="button"
                  className="cf-card"
                  onClick={() => setDetailId(item.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image_url} alt={item.name} />
                  <div className="cf-caption">
                    <strong>{item.name}</strong>
                    <span>
                      {item.owner ? `${item.owner} · ` : ""}
                      {item.category?.name ?? "Sans catégorie"}
                      {item.location ? ` · ${item.location}` : ""}
                      {item.estimated_price != null
                        ? ` · ${formatPrice(item.estimated_price)}`
                        : ""}
                    </span>
                  </div>
                </button>
                <div
                  className="cf-reflection"
                  style={{ backgroundImage: `url(${item.image_url})` }}
                  aria-hidden
                />
              </SwiperSlide>
            ))}
          </Swiper>
          <p className="cf-hint">
            {activeIndex + 1}/{items.length}
          </p>
        </section>
      )}

      <input
        ref={cameraInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onCameraPick(e.target.files?.[0] ?? null)}
      />

      <button
        type="button"
        className="fab"
        onClick={() => cameraInputRef.current?.click()}
      >
        + Photo
      </button>

      {showAdd && (
        <div className="modal" onClick={closeAdd}>
          <article className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Nouvel objet</h2>
              <button type="button" className="ghost" onClick={closeAdd}>
                Fermer
              </button>
            </div>
            <p className="auto-hint">
              {saveStatus === "saving"
                ? "Enregistrement automatique…"
                : "Remplissez le nom : enregistrement auto"}
            </p>
            <div className="add-layout">
              <label className="dropzone compact">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Aperçu" />
                ) : (
                  <span>Choisir une photo</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <div className="fields single">
                <label>
                  Nom *
                  <input
                    value={name}
                    onChange={(e) => {
                      addSavingRef.current = false;
                      setName(e.target.value);
                    }}
                    placeholder="Ex. Canapé"
                    autoFocus
                    required
                  />
                </label>
                <label>
                  Catégorie
                  <select
                    value={categoryId}
                    onChange={(e) => {
                      addSavingRef.current = false;
                      setCategoryId(e.target.value);
                    }}
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
                    list="known-locations"
                    value={location}
                    onChange={(e) => {
                      addSavingRef.current = false;
                      setLocation(e.target.value);
                    }}
                    placeholder="Salon, Cave…"
                    autoComplete="off"
                  />
                </label>
                <label>
                  Quantité
                  <input
                    type="number"
                    min={0}
                    value={quantity}
                    onChange={(e) => {
                      addSavingRef.current = false;
                      setQuantity(Number(e.target.value));
                    }}
                  />
                </label>
                <label>
                  Propriétaire
                  <select
                    value={owner}
                    onChange={(e) => {
                      addSavingRef.current = false;
                      setOwner(e.target.value as ItemOwner | "");
                    }}
                  >
                    <option value="">Non attribué</option>
                    {ITEM_OWNERS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Prix estimé (€)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={estimatedPrice}
                    onChange={(e) => {
                      addSavingRef.current = false;
                      setEstimatedPrice(e.target.value);
                    }}
                  />
                </label>
                <label className="full">
                  Notes
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => {
                      addSavingRef.current = false;
                      setDescription(e.target.value);
                    }}
                  />
                </label>
              </div>
            </div>
          </article>
        </div>
      )}

      {detailItem && draft && (
        <div className="modal" onClick={() => setDetailId(null)}>
          <article className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{draft.name || "Objet"}</h2>
              <button
                type="button"
                className="ghost"
                onClick={() => setDetailId(null)}
              >
                Fermer
              </button>
            </div>
            <p className="auto-hint">
              {saveStatus === "saving"
                ? "Enregistrement…"
                : saveStatus === "saved"
                  ? "Modifications enregistrées"
                  : "Les changements s’enregistrent automatiquement"}
            </p>
            <div className="detail-simple">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={detailItem.image_url} alt={detailItem.name} />
              <div className="fields single">
                <label>
                  Nom
                  <input
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Catégorie
                  <select
                    value={draft.category_id}
                    onChange={(e) =>
                      setDraft({ ...draft, category_id: e.target.value })
                    }
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
                    list="known-locations"
                    value={draft.location}
                    onChange={(e) =>
                      setDraft({ ...draft, location: e.target.value })
                    }
                    autoComplete="off"
                  />
                </label>
                <label>
                  Quantité
                  <input
                    type="number"
                    min={0}
                    value={draft.quantity}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        quantity: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Propriétaire
                  <select
                    value={draft.owner}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        owner: e.target.value as ItemOwner | "",
                      })
                    }
                  >
                    <option value="">Non attribué</option>
                    {ITEM_OWNERS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Prix estimé (€)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.estimated_price}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        estimated_price: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="full">
                  Notes
                  <textarea
                    rows={2}
                    value={draft.description}
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
                  />
                </label>
              </div>
            </div>

            <div className="block">
              <h3>Commentaires</h3>
              <ul className="comment-list">
                {comments.length === 0 ? (
                  <li className="muted">Aucun pour l’instant.</li>
                ) : (
                  comments.map((c) => (
                    <li key={c.id}>
                      <div className="comment-meta">
                        <strong>{c.user?.name ?? "Inconnu"}</strong>
                        <span>{formatDate(c.created_at)}</span>
                      </div>
                      <p>{c.body}</p>
                    </li>
                  ))
                )}
              </ul>
              <div className="comment-form">
                <textarea
                  rows={2}
                  placeholder={`En tant que ${currentUser.name}…`}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => void addComment()}
                  disabled={!commentText.trim()}
                >
                  Publier
                </button>
              </div>
            </div>

            <div className="block">
              <h3>Historique</h3>
              <ul className="history-list">
                {history.length === 0 ? (
                  <li className="muted">Aucune modification.</li>
                ) : (
                  history.slice(0, 8).map((entry) => (
                    <li key={entry.id}>
                      <div className="comment-meta">
                        <strong>
                          {entry.action === "created"
                            ? "Création"
                            : "Modification"}{" "}
                          · {entry.user?.name ?? "Inconnu"}
                        </strong>
                        <span>{formatDate(entry.created_at)}</span>
                      </div>
                      {entry.action === "updated" &&
                        Object.keys(entry.changes ?? {}).length > 0 && (
                          <ul className="history-changes">
                            {Object.entries(entry.changes).map(
                              ([key, change]) => (
                                <li key={key}>
                                  {fieldLabel(key)} :{" "}
                                  {formatHistoryValue(key, change.from)} →{" "}
                                  {formatHistoryValue(key, change.to)}
                                </li>
                              ),
                            )}
                          </ul>
                        )}
                    </li>
                  ))
                )}
              </ul>
            </div>

            <button
              type="button"
              className="danger full-btn"
              onClick={() => void deleteItem(detailItem.id)}
            >
              Supprimer
            </button>
          </article>
        </div>
      )}

      <footer className="site-footer shell-footer">© MK 2026</footer>
    </main>
  );
}
