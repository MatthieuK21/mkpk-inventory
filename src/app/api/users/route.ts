import { NextRequest, NextResponse } from "next/server";
import { isAuthContext, requireAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

/** Liste des profils — réservé admin (préférer /api/admin/users). */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!isAuthContext(auth)) return auth;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_users")
      .select("id, name, login, role, active, must_change_password, created_at")
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ users: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
