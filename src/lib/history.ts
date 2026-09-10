import type { SupabaseClient } from "@supabase/supabase-js";

const FIELD_LABELS: Record<string, string> = {
  name: "Nom",
  description: "Description",
  location: "Lieu",
  quantity: "Quantité",
  category_id: "Catégorie",
  estimated_price: "Prix estimé",
};

export type HistoryChange = {
  from: unknown;
  to: unknown;
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

export function buildChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: string[],
): Record<string, HistoryChange> {
  const changes: Record<string, HistoryChange> = {};
  for (const key of keys) {
    const from = before[key] ?? null;
    const to = after[key] ?? null;
    const fromNorm =
      typeof from === "string" ? from : from === undefined ? null : from;
    const toNorm = typeof to === "string" ? to : to === undefined ? null : to;
    if (JSON.stringify(fromNorm) !== JSON.stringify(toNorm)) {
      changes[key] = { from: fromNorm, to: toNorm };
    }
  }
  return changes;
}

export async function recordItemHistory(
  supabase: SupabaseClient,
  input: {
    itemId: string;
    userId?: string | null;
    action: "created" | "updated";
    changes?: Record<string, HistoryChange>;
  },
) {
  const { error } = await supabase.from("item_history").insert({
    item_id: input.itemId,
    user_id: input.userId || null,
    action: input.action,
    changes: input.changes ?? {},
  });

  if (error) {
    console.error("item_history insert failed:", error.message);
  }
}

export function parsePrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function formatPrice(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

export function formatHistoryValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "vide";
  if (key === "estimated_price") return formatPrice(value);
  return String(value);
}
