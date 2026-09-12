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

export async function upsertLocation(input: {
  title: string;
  address?: string | null;
}): Promise<LocationRecord | null> {
  const title = normalizeTitle(input.title);
  if (!title) return null;

  const address =
    typeof input.address === "string" ? input.address.trim() || null : null;

  const supabase = getSupabaseAdmin();
  const { data: existing, error: findError } = await supabase
    .from("locations")
    .select("*")
    .ilike("title", title)
    .maybeSingle();

  if (findError) {
    if (/relation .*locations.* does not exist/i.test(findError.message)) {
      return {
        id: title,
        title,
        address,
        created_at: new Date().toISOString(),
      };
    }
    throw new Error(findError.message);
  }

  if (existing) {
    const updates: { title: string; address?: string | null } = {
      title: existing.title,
    };
    if (input.address !== undefined) {
      updates.address = address;
    }
    const { data, error } = await supabase
      .from("locations")
      .update(updates)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as LocationRecord;
  }

  const { data, error } = await supabase
    .from("locations")
    .insert({ title, address })
    .select("*")
    .single();
  if (error) {
    if (/relation .*locations.* does not exist/i.test(error.message)) {
      return {
        id: title,
        title,
        address,
        created_at: new Date().toISOString(),
      };
    }
    throw new Error(error.message);
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

export async function getOrphanedLocation(
  title: string | null | undefined,
): Promise<LocationRecord | null> {
  const value = normalizeTitle(title ?? "");
  if (!value) return null;
  const remaining = await countItemsAtLocation(value);
  if (remaining > 0) return null;
  try {
    const found = await findLocationByTitle(value);
    if (found) return found;
  } catch {
    // ignore
  }
  // Proposer la suppression même si le lieu n'est pas encore en table
  return {
    id: value,
    title: value,
    address: null,
    created_at: new Date().toISOString(),
  };
}
