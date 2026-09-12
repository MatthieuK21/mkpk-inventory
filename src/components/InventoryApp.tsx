"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import { EffectCoverflow, Keyboard, Mousewheel } from "swiper/modules";
import "swiper/css";
import "swiper/css/effect-coverflow";
import type {
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
import type { AuthUser } from "@/lib/auth-types";
import {
  clearSession,
  readSessionToken,
  readStoredAuthUser,
  sessionHeaders,
  writeSession,
} from "@/lib/client-auth";
import {
  browserSupportsWebAuthn,
  startRegistration,
} from "@simplewebauthn/browser";
import LoginGate from "@/components/LoginGate";
import AdminUsersPanel from "@/components/AdminUsersPanel";

const NO_LOCATION_KEY = "__none__";

type LocationBubble = {
  key: string;
  label: string;
  count: number;
  coverUrl: string | null;
};

type Draft = {
  name: string;
  description: string;
  location: string;
  quantity: number;
  category_id: string;
  estimated_price: string;
  owner: ItemOwner | "";
};

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
  const [configured, setConfigured] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: "", next: "", confirm: "" });
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [showAdd, setShowAdd] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);

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
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const addSavingRef = useRef(false);
  const editSavingRef = useRef(false);

  const detailItem = detailId
    ? (items.find((item) => item.id === detailId) ?? null)
    : null;

  const locationBubbles = useMemo(() => {
    const map = new Map<string, LocationBubble>();
    for (const item of items) {
      const key = item.location?.trim() || NO_LOCATION_KEY;
      const label = key === NO_LOCATION_KEY ? "Sans lieu" : key;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          label,
          count: 1,
          coverUrl: item.image_url ?? null,
        });
      } else {
        existing.count += 1;
        if (!existing.coverUrl && item.image_url) {
          existing.coverUrl = item.image_url;
        }
      }
    }
    return [...map.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "fr", { sensitivity: "base" }),
    );
  }, [items]);

  const visibleItems = useMemo(() => {
    if (selectedLocation === null) return [];
    if (selectedLocation === NO_LOCATION_KEY) {
      return items.filter((item) => !item.location?.trim());
    }
    return items.filter(
      (item) => (item.location ?? "").trim() === selectedLocation,
    );
  }, [items, selectedLocation]);

  const selectedLocationLabel =
    selectedLocation === NO_LOCATION_KEY
      ? "Sans lieu"
      : selectedLocation;

  useEffect(() => {
    const stored = readStoredAuthUser();
    const token = readSessionToken();
    if (stored && token) setCurrentUser(stored);

    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setConfigured(Boolean(data.configured));
      })
      .catch(() => setConfigured(false))
      .finally(() => setSessionReady(true));

    if (token) {
      fetch("/api/auth/me", { headers: sessionHeaders(token) })
        .then(async (r) => {
          const json = await r.json();
          if (!r.ok) {
            clearSession();
            setCurrentUser(null);
            return;
          }
          setCurrentUser(json.user);
          writeSession(token, json.user);
        })
        .catch(() => {
          clearSession();
          setCurrentUser(null);
        });
    }
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (categoryFilter) params.set("category", categoryFilter);
      if (ownerFilter) params.set("owner", ownerFilter);

      const headers = sessionHeaders();
      const [catRes, itemRes, locRes] = await Promise.all([
        fetch("/api/categories", { headers }),
        fetch(`/api/items?${params}`, { headers }),
        fetch("/api/locations", { headers }),
      ]);

      if ([catRes, itemRes, locRes].some((r) => r.status === 401)) {
        clearSession();
        setCurrentUser(null);
        throw new Error("Session expirée — reconnectez-vous");
      }

      const [catJson, itemJson, locJson] = await Promise.all([
        catRes.json(),
        itemRes.json(),
        locRes.json(),
      ]);

      if (!catRes.ok) throw new Error(catJson.error || "Erreur catégories");
      if (!itemRes.ok) throw new Error(itemJson.error || "Erreur inventaire");
      if (!locRes.ok) throw new Error(locJson.error || "Erreur lieux");

      const nextItems: InventoryItem[] = itemJson.items ?? [];
      setCategories(catJson.categories ?? []);
      setLocations(locJson.locations ?? []);
      setItems(nextItems);
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
    if (!configured || !currentUser || currentUser.must_change_password) return;
    const t = setTimeout(() => void loadData(), 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    configured,
    currentUser,
    query,
    categoryFilter,
    ownerFilter,
  ]);

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
            headers: sessionHeaders(),
          }),
          fetch(`/api/items/${detailItem.id}/history`, {
            headers: sessionHeaders(),
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

  function onAuthenticated(user: AuthUser, token: string) {
    writeSession(token, user);
    setCurrentUser(user);
    setError(null);
  }

  function disconnect() {
    clearSession();
    setCurrentUser(null);
    setShowAdmin(false);
    setItems([]);
    setSelectedLocation(null);
  }

  async function registerMyBiometrics() {
    if (!browserSupportsWebAuthn()) {
      setError("Biométrie non supportée sur cet appareil");
      return;
    }
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
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur empreinte / Face ID",
      );
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pwdForm.next !== pwdForm.confirm) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders(),
        },
        body: JSON.stringify({
          currentPassword: pwdForm.current,
          nextPassword: pwdForm.next,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Changement impossible");
      writeSession(json.token, json.user);
      setCurrentUser(json.user);
      setPwdForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur mot de passe");
    }
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
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  function closeAdd() {
    setShowAdd(false);
    resetAdd();
    setSaveStatus("idle");
  }

  function onImagePick(selected: File | null) {
    if (!selected) return;
    setFile(selected);
    setShowSourcePicker(false);
    setShowAdd(true);
    addSavingRef.current = false;
  }

  function openCamera() {
    setShowSourcePicker(false);
    requestAnimationFrame(() => cameraInputRef.current?.click());
  }

  function openGallery() {
    setShowSourcePicker(false);
    requestAnimationFrame(() => galleryInputRef.current?.click());
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
        headers: sessionHeaders(),
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
    if (editSavingRef.current || !current.name.trim()) return false;
    editSavingRef.current = true;
    setSaveStatus("saving");
    setError(null);
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders(),
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
        headers: sessionHeaders(),
      });
      const hJson = await hRes.json();
      if (hRes.ok) setHistory(hJson.history ?? []);
      setTimeout(() => setSaveStatus("idle"), 1200);
      return true;
    } catch (err) {
      setSaveStatus("idle");
      setError(err instanceof Error ? err.message : "Erreur de mise à jour");
      return false;
    } finally {
      editSavingRef.current = false;
    }
  }

  async function closeDetail() {
    if (detailItem && draft && isDraftDirty(detailItem, draft)) {
      if (!draft.name.trim()) {
        setError("Le nom est obligatoire");
        return;
      }
      const ok = await saveItem(detailItem.id, draft);
      if (!ok) return;
    }
    setDetailId(null);
  }

  async function addComment() {
    if (!detailItem || !currentUser || !commentText.trim()) return;
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/items/${detailItem.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders(),
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
        headers: sessionHeaders(),
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
      <main className="gate">
        <div className="gate-card">
          <p className="brand">MKPK</p>
          <h1>Config requise</h1>
          <p className="muted">Variables Supabase manquantes.</p>
        </div>
      </main>
    );
  }

  if (!sessionReady) {
    return (
      <main className="gate">
        <div className="gate-card">
          <p className="brand">MKPK</p>
          <p className="muted">Chargement…</p>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return <LoginGate onAuthenticated={onAuthenticated} />;
  }

  if (currentUser.must_change_password) {
    return (
      <main className="gate">
        <form className="gate-card" onSubmit={changePassword}>
          <p className="brand">MKPK</p>
          <h1>Nouveau mot de passe</h1>
          <p className="muted">
            Bonjour {currentUser.name}, choisissez un mot de passe personnel.
          </p>
          {error && <p className="error">{error}</p>}
          <input
            type="password"
            value={pwdForm.current}
            onChange={(e) =>
              setPwdForm((p) => ({ ...p, current: e.target.value }))
            }
            placeholder="Mot de passe actuel"
            autoComplete="current-password"
          />
          <input
            type="password"
            value={pwdForm.next}
            onChange={(e) =>
              setPwdForm((p) => ({ ...p, next: e.target.value }))
            }
            placeholder="Nouveau mot de passe"
            autoComplete="new-password"
            required
          />
          <input
            type="password"
            value={pwdForm.confirm}
            onChange={(e) =>
              setPwdForm((p) => ({ ...p, confirm: e.target.value }))
            }
            placeholder="Confirmer"
            autoComplete="new-password"
            required
          />
          <button type="submit">Enregistrer</button>
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="menubar">
        {selectedLocation !== null ? (
          <button
            type="button"
            className="menubar-back"
            onClick={() => {
              setSelectedLocation(null);
              setDetailId(null);
              setActiveIndex(0);
            }}
            aria-label="Retour aux lieux"
          >
            ←
          </button>
        ) : null}
        <span className="brand menubar-brand">
          {selectedLocation !== null ? selectedLocationLabel : "MKPK"}
        </span>
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
              : selectedLocation !== null
                ? visibleItems.length
                : locationBubbles.length}
        </span>
        {currentUser.role === "admin" ? (
          <button
            type="button"
            className="menubar-user"
            onClick={() => setShowAdmin(true)}
          >
            Admin
          </button>
        ) : null}
        <button
          type="button"
          className="menubar-user"
          onClick={() => void registerMyBiometrics()}
          title="Enregistrer empreinte ou Face ID"
        >
          Bio
        </button>
        <button type="button" className="menubar-user" onClick={disconnect}>
          {currentUser.name}
        </button>
      </header>

      <AdminUsersPanel
        open={showAdmin}
        onClose={() => setShowAdmin(false)}
        knownLocations={locations}
      />

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
      ) : selectedLocation === null ? (
        <section className="location-map stage-fill" aria-label="Lieux">
          <div className="location-map-grid">
            {locationBubbles.map((bubble) => (
              <button
                key={bubble.key}
                type="button"
                className="location-bubble"
                onClick={() => {
                  setSelectedLocation(bubble.key);
                  setActiveIndex(0);
                  setDetailId(null);
                }}
              >
                <span
                  className="location-bubble-cover"
                  style={
                    bubble.coverUrl
                      ? { backgroundImage: `url(${bubble.coverUrl})` }
                      : undefined
                  }
                  aria-hidden
                />
                <span className="location-bubble-body">
                  <span className="location-bubble-name">{bubble.label}</span>
                  <span className="location-bubble-count">
                    {bubble.count} objet{bubble.count > 1 ? "s" : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : visibleItems.length === 0 ? (
        <div className="empty-state stage-fill">
          <p className="muted">Aucun objet dans ce lieu.</p>
          <button
            type="button"
            className="ghost"
            onClick={() => setSelectedLocation(null)}
          >
            Retour aux lieux
          </button>
        </div>
      ) : (
        <section className="coverflow-stage stage-fill">
          <Swiper
            key={selectedLocation}
            modules={[EffectCoverflow, Keyboard, Mousewheel]}
            effect="coverflow"
            grabCursor
            centeredSlides
            slidesPerView="auto"
            initialSlide={0}
            speed={620}
            resistanceRatio={0.65}
            threshold={4}
            keyboard={{ enabled: true }}
            mousewheel={{
              forceToAxis: true,
              sensitivity: 0.85,
              releaseOnEdges: true,
              thresholdDelta: 6,
              thresholdTime: 40,
            }}
            coverflowEffect={{
              rotate: 16,
              stretch: -18,
              depth: 140,
              modifier: 1.05,
              slideShadows: true,
            }}
            onSwiper={(swiper) => {
              swiperRef.current = swiper;
            }}
            onSlideChange={(swiper) => setActiveIndex(swiper.activeIndex)}
            className="coverflow-swiper"
          >
            {visibleItems.map((item) => (
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
            {Math.min(activeIndex + 1, visibleItems.length)}/{visibleItems.length}
          </p>
        </section>
      )}

      <input
        ref={cameraInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onImagePick(e.target.files?.[0] ?? null)}
      />
      <input
        ref={galleryInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        onChange={(e) => onImagePick(e.target.files?.[0] ?? null)}
      />

      <button
        type="button"
        className="fab"
        onClick={() => {
          if (
            selectedLocation &&
            selectedLocation !== NO_LOCATION_KEY
          ) {
            setLocation(selectedLocation);
          }
          setShowSourcePicker(true);
        }}
      >
        + Photo
      </button>

      {showSourcePicker && (
        <div className="modal" onClick={() => setShowSourcePicker(false)}>
          <article
            className="sheet source-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>Ajouter une photo</h2>
              <button
                type="button"
                className="ghost"
                onClick={() => setShowSourcePicker(false)}
              >
                Fermer
              </button>
            </div>
            <div className="source-actions">
              <button type="button" className="source-btn" onClick={openCamera}>
                Prendre une photo
              </button>
              <button type="button" className="source-btn" onClick={openGallery}>
                Choisir dans la galerie
              </button>
            </div>
          </article>
        </div>
      )}

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
              <div className="photo-picker">
                <label className="dropzone compact">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="Aperçu" />
                  ) : (
                    <span>Aperçu photo</span>
                  )}
                </label>
                <div className="source-actions inline">
                  <button type="button" className="ghost" onClick={openCamera}>
                    Caméra
                  </button>
                  <button type="button" className="ghost" onClick={openGallery}>
                    Galerie
                  </button>
                </div>
              </div>
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
        <div
          className="modal"
          onClick={() => {
            void closeDetail();
          }}
        >
          <article className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{draft.name || "Objet"}</h2>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  void closeDetail();
                }}
              >
                Fermer
              </button>
            </div>
            <p className="auto-hint">
              {saveStatus === "saving"
                ? "Enregistrement…"
                : "Les modifications s’enregistrent à la fermeture"}
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
