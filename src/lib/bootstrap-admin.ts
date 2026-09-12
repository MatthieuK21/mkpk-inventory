import { getSupabaseAdmin } from "@/lib/supabase";
import { hashPassword } from "@/lib/passwords";

/**
 * Garantit un compte admin utilisable.
 * Mot de passe : ADMIN_PASSWORD, sinon INVENTORY_PASSWORD, sinon "Matthieu2026!"
 */
export async function ensureAdminBootstrap(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const password =
    process.env.ADMIN_PASSWORD?.trim() ||
    process.env.INVENTORY_PASSWORD?.trim() ||
    "Matthieu2026!";

  const { data: admins, error } = await supabase
    .from("app_users")
    .select("id, login, password_hash")
    .eq("role", "admin")
    .eq("active", true);

  if (error) throw new Error(error.message);

  const ready = (admins ?? []).find((row) => row.login && row.password_hash);
  if (ready) return;

  const hash = await hashPassword(password);
  const existing =
    (admins ?? [])[0] ??
    (
      await supabase
        .from("app_users")
        .select("id, login, password_hash")
        .ilike("name", "matthieu")
        .maybeSingle()
    ).data;

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("app_users")
      .update({
        login: existing.login || "matthieu",
        password_hash: existing.password_hash || hash,
        role: "admin",
        active: true,
        must_change_password: !existing.password_hash,
      })
      .eq("id", existing.id);
    if (updateError) throw new Error(updateError.message);
    return;
  }

  const { error: insertError } = await supabase.from("app_users").insert({
    name: "Matthieu",
    login: "matthieu",
    password_hash: hash,
    role: "admin",
    active: true,
    must_change_password: true,
  });
  if (insertError) throw new Error(insertError.message);
}
