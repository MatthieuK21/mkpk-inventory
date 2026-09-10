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
} from "@/lib/types";
import {
  fieldLabel,
  formatHistoryValue,
  formatPrice,
} from "@/lib/history";

const PASSWORD_KEY = "mkpk-inventory-password";
const USER_KEY = "mkpk-inventory-user";

function authHeaders(password: string): HeadersInit {
  return password ? { "x-inventory-password": password } : {};
}

function loadStoredUser(): AppUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppUser;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const swiperRef = useRef<SwiperType | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [estimatedPrice, setEstimatedPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editDrafts, setEditDrafts] = useState<
    Record<
      string,
      {
        name: string;
        description: string;
        location: string;
        quantity: number;
        category_id: string;
        estimated_price: string;
      }
    >
  >({});
  const [commentsByItem, setCommentsByItem] = useState<
    Record<string, ItemComment[]>
  >({});
  const [historyByItem, setHistoryByItem] = useState<
    Record<string, ItemHistoryEntry[]>
  >({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [commentingItemId, setCommentingItemId] = useState<string | null>(null);

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

      const [catRes, itemRes, userRes, locRes] = await Promise.all([
        fetch("/api/categories", { headers: authHeaders(pwd) }),
        fetch(`/api/items?${params}`, { headers: authHeaders(pwd) }),
        fetch("/api/users", { headers: authHeaders(pwd) }),
        fetch("/api/locations", { headers: authHeaders(pwd) }),
      ]);

      if (
        catRes.status === 401 ||
        itemRes.status === 401 ||
        userRes.status === 401 ||
        locRes.status === 401
      ) {
        setUnlocked(false);
        sessionStorage.removeItem(PASSWORD_KEY);
        throw new Error("Mot de passe incorrect");
      }

      const catJson = await catRes.json();
      const itemJson = await itemRes.json();
      const userJson = await userRes.json();
      const locJson = await locRes.json();

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

    const t = setTimeout(() => {
      void loadData();
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, configured, currentUser, query, categoryFilter]);

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
    if (!detailItem || !currentUser) return;

    setEditDrafts((prev) => ({
      ...prev,
      [detailItem.id]:
        prev[detailItem.id] ?? {
          name: detailItem.name,
          description: detailItem.description ?? "",
          location: detailItem.location ?? "",
          quantity: detailItem.quantity,
          category_id: detailItem.category_id ?? "",
          estimated_price:
            detailItem.estimated_price === null ||
            detailItem.estimated_price === undefined
              ? ""
              : String(detailItem.estimated_price),
        },
    }));

    if (!commentsByItem[detailItem.id]) {
      void loadComments(detailItem.id);
    }
    if (!historyByItem[detailItem.id]) {
      void loadHistory(detailItem.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailItem?.id, currentUser]);

  const hasFilters = Boolean(query.trim() || categoryFilter);

  function openDetail(itemId: string) {
    setDetailId(itemId);
  }

  function closeDetail() {
    setDetailId(null);
  }

  async function loadComments(itemId: string) {
    try {
      const res = await fetch(`/api/items/${itemId}/comments`, {
        headers: authHeaders(password),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur commentaires");
      setCommentsByItem((prev) => ({ ...prev, [itemId]: json.comments ?? [] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur commentaires");
    }
  }

  async function loadHistory(itemId: string) {
    try {
      const res = await fetch(`/api/items/${itemId}/history`, {
        headers: authHeaders(password),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur historique");
      setHistoryByItem((prev) => ({ ...prev, [itemId]: json.history ?? [] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur historique");
    }
  }

  function connectAs(user: AppUser) {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    setCurrentUser(user);
  }

  function disconnect() {
    sessionStorage.removeItem(USER_KEY);
    setCurrentUser(null);
  }

  function resetAddForm() {
    setName("");
    setDescription("");
    setLocation("");
    setQuantity(1);
    setEstimatedPrice("");
    setCategoryId("");
    setFile(null);
    setNewCategoryName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function closeAdd() {
    setShowAdd(false);
    resetAddForm();
  }

  function unlock(e: FormEvent) {
    e.preventDefault();
    sessionStorage.setItem(PASSWORD_KEY, password);
    setUnlocked(true);
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    if (!newUserName.trim()) return;
    setError(null);
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
      if (!res.ok) throw new Error(json.error || "Impossible de créer l'utilisateur");
      setNewUserName("");
      connectAs(json.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur utilisateur");
    }
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
      if (estimatedPrice.trim()) {
        form.set("estimated_price", estimatedPrice.trim());
      }
      if (currentUser) form.set("user_id", currentUser.id);
      if (categoryId) form.set("category_id", categoryId);

      const res = await fetch("/api/items", {
        method: "POST",
        headers: authHeaders(password),
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Échec de l'enregistrement");

      closeAdd();
      await loadData();
      setActiveIndex(0);
      requestAnimationFrame(() => swiperRef.current?.slideTo(0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function addCategory() {
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
      setCategoryId(json.category?.id ?? "");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur catégorie");
    }
  }

  async function saveItem(itemId: string) {
    const current = editDrafts[itemId];
    if (!current?.name.trim()) return;

    setSavingItemId(itemId);
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
          user_id: currentUser?.id ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Échec de la mise à jour");

      setItems((prev) =>
        prev.map((item) => (item.id === itemId ? json.item : item)),
      );
      setEditDrafts((prev) => ({
        ...prev,
        [itemId]: {
          name: json.item.name,
          description: json.item.description ?? "",
          location: json.item.location ?? "",
          quantity: json.item.quantity,
          category_id: json.item.category_id ?? "",
          estimated_price:
            json.item.estimated_price === null ||
            json.item.estimated_price === undefined
              ? ""
              : String(json.item.estimated_price),
        },
      }));
      await loadHistory(itemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de mise à jour");
    } finally {
      setSavingItemId(null);
    }
  }

  async function addComment(itemId: string) {
    if (!currentUser) return;
    const body = (commentDrafts[itemId] ?? "").trim();
    if (!body) return;

    setCommentingItemId(itemId);
    setError(null);
    try {
      const res = await fetch(`/api/items/${itemId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(password),
        },
        body: JSON.stringify({ user_id: currentUser.id, body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Échec du commentaire");

      setCommentsByItem((prev) => ({
        ...prev,
        [itemId]: [...(prev[itemId] ?? []), json.comment],
      }));
      setCommentDrafts((prev) => ({ ...prev, [itemId]: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur commentaire");
    } finally {
      setCommentingItemId(null);
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
      setDetailId(null);
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

  if (!currentUser) {
    return (
      <main className="gate">
        <div className="gate-card identity">
          <p className="brand">MKPK</p>
          <h1>Qui êtes-vous ?</h1>
          <p className="muted">
            Choisissez votre profil pour commenter et éditer les objets.
          </p>
          {error && <p className="error">{error}</p>}
          <div className="user-list">
            {users.length === 0 ? (
              <p className="muted">Aucun profil. Créez le vôtre ci-dessous.</p>
            ) : (
              users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="user-chip"
                  onClick={() => connectAs(user)}
                >
                  {user.name}
                </button>
              ))
            )}
          </div>
          <form className="new-user" onSubmit={createUser}>
            <input
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="Nouveau profil (prénom)"
              required
            />
            <button type="submit">Créer et entrer</button>
          </form>
        </div>
      </main>
    );
  }

  const draft = detailItem ? editDrafts[detailItem.id] : null;
  const comments = detailItem ? (commentsByItem[detailItem.id] ?? []) : [];
  const history = detailItem ? (historyByItem[detailItem.id] ?? []) : [];

  return (
    <main className="app app-coverflow">
      <header className="topbar">
        <div>
          <p className="brand">MKPK</p>
          <h1>Inventaire</h1>
        </div>
        <div className="topbar-actions">
          <span className="count">
            {items.length} objet{items.length > 1 ? "s" : ""}
          </span>
          <span className="user-badge">
            Connecté : <strong>{currentUser.name}</strong>
          </span>
          <button type="button" className="ghost" onClick={disconnect}>
            Changer
          </button>
          <button
            type="button"
            className="add-btn"
            onClick={() => setShowAdd(true)}
          >
            + Ajouter
          </button>
        </div>
      </header>

      {error && <p className="error banner">{error}</p>}

      <datalist id="known-locations">
        {locations.map((loc) => (
          <option key={loc} value={loc} />
        ))}
      </datalist>

      <section className="filters-bar">
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
      </section>

      {loading ? (
        <p className="muted stage-msg">Chargement…</p>
      ) : items.length === 0 ? (
        <div className="empty-state stage-msg">
          <p className="muted">
            {hasFilters
              ? "Aucun objet ne correspond à ces filtres."
              : "Aucun objet pour le moment."}
          </p>
          {!hasFilters && (
            <button type="button" onClick={() => setShowAdd(true)}>
              Ajouter le premier objet
            </button>
          )}
        </div>
      ) : (
        <>
          <section className="coverflow-stage">
            <button
              type="button"
              className="cf-nav prev"
              aria-label="Photo précédente"
              onClick={() => swiperRef.current?.slidePrev()}
            >
              ‹
            </button>
            <button
              type="button"
              className="cf-nav next"
              aria-label="Photo suivante"
              onClick={() => swiperRef.current?.slideNext()}
            >
              ›
            </button>

            <Swiper
              modules={[EffectCoverflow, Keyboard, Mousewheel]}
              effect="coverflow"
              grabCursor
              centeredSlides
              slidesPerView="auto"
              initialSlide={activeIndex}
              keyboard={{ enabled: true }}
              mousewheel={{
                forceToAxis: true,
                sensitivity: 1,
                releaseOnEdges: true,
              }}
              coverflowEffect={{
                rotate: 28,
                stretch: 0,
                depth: 180,
                modifier: 1.15,
                slideShadows: true,
              }}
              onSwiper={(swiper) => {
                swiperRef.current = swiper;
              }}
              onSlideChange={(swiper) => setActiveIndex(swiper.activeIndex)}
              onClick={(swiper) => {
                const idx = swiper.clickedIndex;
                if (typeof idx === "number" && items[idx]) {
                  openDetail(items[idx].id);
                }
              }}
              className="coverflow-swiper"
            >
              {items.map((item) => (
                <SwiperSlide key={item.id} className="coverflow-slide">
                  <button
                    type="button"
                    className="cf-card"
                    onClick={() => openDetail(item.id)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image_url} alt={item.name} />
                    <div className="cf-caption">
                      <strong>{item.name}</strong>
                      <span>
                        {item.category?.name ?? "Sans catégorie"}
                        {item.location ? ` · ${item.location}` : ""}
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
              Scroll / glisser · clic pour éditer · {activeIndex + 1}/
              {items.length}
            </p>
          </section>
        </>
      )}

      {detailItem && draft && (
        <div className="modal" onClick={closeDetail}>
          <article
            className="modal-detail-edit"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>{detailItem.name}</h2>
              <button
                type="button"
                className="ghost close-x"
                onClick={closeDetail}
              >
                Fermer
              </button>
            </div>

            <div className="detail-grid">
              <div className="detail-photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={detailItem.image_url} alt={detailItem.name} />
              </div>

              <div className="acc-edit">
                <p className="muted detail-meta">
                  {detailItem.category?.name ?? "Sans catégorie"}
                  {detailItem.location ? ` · ${detailItem.location}` : ""}
                  {` · ×${detailItem.quantity}`}
                  {detailItem.estimated_price != null
                    ? ` · ${formatPrice(detailItem.estimated_price)}`
                    : ""}
                </p>
                <h3>Modifier</h3>
                <div className="fields">
                  <label>
                    Nom
                    <input
                      value={draft.name}
                      onChange={(e) =>
                        setEditDrafts((prev) => ({
                          ...prev,
                          [detailItem.id]: {
                            ...draft,
                            name: e.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Catégorie
                    <select
                      value={draft.category_id}
                      onChange={(e) =>
                        setEditDrafts((prev) => ({
                          ...prev,
                          [detailItem.id]: {
                            ...draft,
                            category_id: e.target.value,
                          },
                        }))
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
                        setEditDrafts((prev) => ({
                          ...prev,
                          [detailItem.id]: {
                            ...draft,
                            location: e.target.value,
                          },
                        }))
                      }
                      placeholder="Choisir ou saisir un lieu"
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
                        setEditDrafts((prev) => ({
                          ...prev,
                          [detailItem.id]: {
                            ...draft,
                            quantity: Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Prix estimé (€)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={draft.estimated_price}
                      onChange={(e) =>
                        setEditDrafts((prev) => ({
                          ...prev,
                          [detailItem.id]: {
                            ...draft,
                            estimated_price: e.target.value,
                          },
                        }))
                      }
                      placeholder="Ex. 150"
                    />
                  </label>
                  <label className="full">
                    Description
                    <textarea
                      rows={3}
                      value={draft.description}
                      onChange={(e) =>
                        setEditDrafts((prev) => ({
                          ...prev,
                          [detailItem.id]: {
                            ...draft,
                            description: e.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    onClick={() => void saveItem(detailItem.id)}
                    disabled={savingItemId === detailItem.id}
                  >
                    {savingItemId === detailItem.id
                      ? "Enregistrement…"
                      : "Enregistrer"}
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void deleteItem(detailItem.id)}
                  >
                    Supprimer
                  </button>
                </div>
              </div>

              <div className="acc-comments">
                <h3>Commentaires</h3>
                <ul className="comment-list">
                  {comments.length === 0 ? (
                    <li className="muted">Aucun commentaire.</li>
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
                    placeholder={`Commentaire en tant que ${currentUser.name}…`}
                    value={commentDrafts[detailItem.id] ?? ""}
                    onChange={(e) =>
                      setCommentDrafts((prev) => ({
                        ...prev,
                        [detailItem.id]: e.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => void addComment(detailItem.id)}
                    disabled={
                      commentingItemId === detailItem.id ||
                      !(commentDrafts[detailItem.id] ?? "").trim()
                    }
                  >
                    {commentingItemId === detailItem.id ? "Envoi…" : "Publier"}
                  </button>
                </div>
              </div>

              <div className="acc-history">
                <h3>Historique des modifications</h3>
                <ul className="history-list">
                  {history.length === 0 ? (
                    <li className="muted">Aucune modification enregistrée.</li>
                  ) : (
                    history.map((entry) => (
                      <li key={entry.id}>
                        <div className="comment-meta">
                          <strong>
                            {entry.action === "created"
                              ? "Création"
                              : "Modification"}
                            {" · "}
                            {entry.user?.name ?? "Inconnu"}
                          </strong>
                          <span>{formatDate(entry.created_at)}</span>
                        </div>
                        {entry.action === "updated" &&
                        Object.keys(entry.changes ?? {}).length > 0 ? (
                          <ul className="history-changes">
                            {Object.entries(entry.changes).map(([key, change]) => (
                              <li key={key}>
                                <strong>{fieldLabel(key)}</strong> :{" "}
                                {formatHistoryValue(key, change.from)} →{" "}
                                {formatHistoryValue(key, change.to)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="muted">Objet ajouté à l’inventaire.</p>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </article>
        </div>
      )}

      {showAdd && (
        <div className="modal" onClick={closeAdd}>
          <article className="modal-add" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Ajouter un objet</h2>
              <button type="button" className="ghost close-x" onClick={closeAdd}>
                Fermer
              </button>
            </div>
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
                    autoFocus
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
                    list="known-locations"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Choisir ou saisir un lieu"
                    autoComplete="off"
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
                <label>
                  Prix estimé (€)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={estimatedPrice}
                    onChange={(e) => setEstimatedPrice(e.target.value)}
                    placeholder="Ex. 150"
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
                <div className="new-cat full">
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Nouvelle catégorie"
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void addCategory()}
                  >
                    Créer
                  </button>
                </div>
                <button type="submit" disabled={saving || !file || !name.trim()}>
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </form>
          </article>
        </div>
      )}
    </main>
  );
}
