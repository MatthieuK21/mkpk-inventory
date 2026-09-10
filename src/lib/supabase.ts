import { createClient, SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Variables manquantes : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return adminClient;
}

export function getPublicImageUrl(imagePath: string): string {
  const url = process.env.SUPABASE_URL;
  if (!url) return "";
  return `${url}/storage/v1/object/public/inventory/${imagePath}`;
}
