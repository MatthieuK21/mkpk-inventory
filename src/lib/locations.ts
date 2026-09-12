import { getSupabaseAdmin } from "@/lib/supabase";

export type LocationRecord = {
  id: string;
  title: string;
  address: string | null;
  created_at: string;
  updated_at?: string;
  item_count?: number;
};

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

export async function findLocationByTitle(
  title: string,
): Promise<LocationRecord | null> {
  const value = normalizeTitle(title);
  if (!value) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .ilike("title", value)
    .maybeSingle();
  if (error) {
    if (/relation .*locations.* does not exist/i.test(error.message)) {
      return null;
    }
    throw new Error(error.message);
  }
  return (data as LocationRecord) ?? null;
}

export async function findLocationById(
  id: string,
): Promise<LocationRecord | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LocationRecord) ?? null;
}

/** Vérifie qu'un lieu du catalogue existe (titre exact après normalisation). */
export async function requireCatalogLocation(
  title: string | null | undefined,
): Promise<LocationRecord | null> {
  const value = normalizeTitle(title ?? "");
  if (!value) return null;
  const found = await findLocationByTitle(value);
  if (!found) {
    throw new Error(
      "Ce lieu n'existe pas. Créez-le d'abord dans Paramètres → Lieux.",
    );
  }
  return found;
}

export async function createLocation(input: {
  title: string;
  address?: string | null;
}): Promise<LocationRecord> {
  const title = normalizeTitle(input.title);
  if (!title) throw new Error("Le titre du lieu est obligatoire");
  const address =
    typeof input.address === "string" ? input.address.trim() || null : null;

  const existing = await findLocationByTitle(title);
  if (existing) {
    throw new Error("Un lieu avec ce titre existe déjà");
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("locations")
    .insert({ title, address })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as LocationRecord;
}

export async function updateLocation(input: {
  id: string;
  title?: string;
  address?: string | null;
}): Promise<LocationRecord> {
  const supabase = getSupabaseAdmin();
  const current = await findLocationById(input.id);
  if (!current) throw new Error("Lieu introuvable");

  const nextTitle =
    input.title !== undefined ? normalizeTitle(input.title) : current.title;
  if (!nextTitle) throw new Error("Le titre du lieu est obligatoire");

  if (nextTitle.toLowerCase() !== current.title.toLowerCase()) {
    const clash = await findLocationByTitle(nextTitle);
    if (clash && clash.id !== current.id) {
      throw new Error("Un lieu avec ce titre existe déjà");
    }
  }

  const updates: { title: string; address?: string | null } = {
    title: nextTitle,
  };
  if (input.address !== undefined) {
    updates.address =
      input.address === null ? null : String(input.address).trim() || null;
  }

  const { data, error } = await supabase
    .from("locations")
    .update(updates)
    .eq("id", current.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  // Propager le renommage sur les objets et les droits
  if (nextTitle.toLowerCase() !== current.title.toLowerCase()) {
    await supabase
      .from("items")
      .update({ location: nextTitle })
      .ilike("location", current.title);
    await supabase
      .from("user_location_grants")
      .update({ location: nextTitle })
      .ilike("location", current.title);
  }

  return data as LocationRecord;
}

export async function countItemsAtLocation(title: string): Promise<number> {
  const value = normalizeTitle(title);
  if (!value) return 0;
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("items")
    .select("*", { count: "exact", head: true })
    .ilike("location", value);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getOrphanedLocation(
  title: string | null | undefined,
): Promise<LocationRecord | null> {
  const value = normalizeTitle(title ?? "");
  if (!value) return null;
  const remaining = await countItemsAtLocation(value);
  if (remaining > 0) return null;
  return findLocationByTitle(value);
}
