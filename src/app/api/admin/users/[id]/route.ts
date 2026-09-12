import { NextRequest, NextResponse } from "next/server";
import { isAuthContext, requireAdmin } from "@/lib/auth";
import { hashPassword, validatePassword } from "@/lib/passwords";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { AuthUser, UserRole } from "@/lib/auth-types";

type Params = { params: Promise<{ id: string }> };

function toAuthUser(row: {
  id: string;
  name: string;
  login: string | null;
  role: string | null;
  active: boolean | null;
  must_change_password: boolean | null;
  created_at: string;
  password_hash?: string | null;
}): AuthUser | null {
  if (!row.login) return null;
  return {
    id: row.id,
    name: row.name,
    login: row.login,
    role: row.role === "admin" ? "admin" : "user",
    active: row.active !== false,
    must_change_password: Boolean(row.must_change_password),
    created_at: row.created_at,
    has_password: Boolean(row.password_hash),
    has_webauthn: false,
  };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if (!isAuthContext(auth)) return auth;
  const { id } = await params;

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") updates.name = body.name.trim();
    if (typeof body.login === "string") {
      updates.login = body.login.trim().toLowerCase();
    }
    if (body.role === "admin" || body.role === "user") {
      updates.role = body.role as UserRole;
    }
    if (typeof body.active === "boolean") updates.active = body.active;
    if (typeof body.must_change_password === "boolean") {
      updates.must_change_password = body.must_change_password;
    }
    if (typeof body.password === "string" && body.password.trim()) {
      const strength = validatePassword(body.password);
      if (strength) {
        return NextResponse.json({ error: strength }, { status: 400 });
      }
      updates.password_hash = await hashPassword(body.password);
      updates.must_change_password = Boolean(body.must_change_password);
    }

    if (Object.keys(updates).length === 0 && !("locations" in body)) {
      return NextResponse.json({ error: "Aucune modification" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("app_users")
        .update(updates)
        .eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (Array.isArray(body.locations)) {
      const locations = body.locations
        .map((l: unknown) => String(l).trim())
        .filter(Boolean);
      await supabase.from("user_location_grants").delete().eq("user_id", id);
      if (locations.length > 0) {
        const { error: grantError } = await supabase
          .from("user_location_grants")
          .insert(locations.map((location: string) => ({ user_id: id, location })));
        if (grantError) {
          return NextResponse.json({ error: grantError.message }, { status: 500 });
        }
      }
    }

    const { data, error } = await supabase
      .from("app_users")
      .select(
        "id, name, login, role, active, must_change_password, created_at, password_hash",
      )
      .eq("id", id)
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const user = toAuthUser(data);
    if (!user) {
      return NextResponse.json({ error: "Utilisateur invalide" }, { status: 500 });
    }

    const { data: grants } = await supabase
      .from("user_location_grants")
      .select("location")
      .eq("user_id", id);
    const { count } = await supabase
      .from("webauthn_credentials")
      .select("*", { count: "exact", head: true })
      .eq("user_id", id);

    return NextResponse.json({
      user: {
        ...user,
        has_webauthn: (count ?? 0) > 0,
        locations: (grants ?? []).map((g) => String(g.location)).sort((a, b) =>
          a.localeCompare(b, "fr"),
        ),
        webauthn_count: count ?? 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if (!isAuthContext(auth)) return auth;
  const { id } = await params;

  if (id === auth.user.id) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas supprimer votre propre compte" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("app_users").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
