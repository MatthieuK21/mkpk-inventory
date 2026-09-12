import { NextRequest, NextResponse } from "next/server";
import { ensureAdminBootstrap } from "@/lib/bootstrap-admin";
import { createSessionToken } from "@/lib/session";
import { verifyPassword } from "@/lib/passwords";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { AuthUser } from "@/lib/auth-types";

function toPublicUser(row: {
  id: string;
  name: string;
  login: string;
  role: string;
  active: boolean;
  must_change_password: boolean;
  created_at: string;
  password_hash?: string | null;
}): AuthUser {
  return {
    id: row.id,
    name: row.name,
    login: row.login,
    role: row.role === "admin" ? "admin" : "user",
    active: row.active !== false,
    must_change_password: Boolean(row.must_change_password),
    created_at: row.created_at,
    has_password: Boolean(row.password_hash),
  };
}

export async function POST(request: NextRequest) {
  try {
    await ensureAdminBootstrap();
    const body = await request.json();
    const login = String(body.login ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!login || !password) {
      return NextResponse.json(
        { error: "Identifiant et mot de passe requis" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_users")
      .select(
        "id, name, login, role, active, must_change_password, created_at, password_hash",
      )
      .ilike("login", login)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data?.login || data.active === false) {
      return NextResponse.json(
        { error: "Identifiants incorrects" },
        { status: 401 },
      );
    }

    const ok = await verifyPassword(password, data.password_hash);
    if (!ok) {
      return NextResponse.json(
        { error: "Identifiants incorrects" },
        { status: 401 },
      );
    }

    const user = toPublicUser({ ...data, login: data.login });
    const token = createSessionToken({
      id: user.id,
      name: user.name,
      login: user.login,
      role: user.role,
    });

    return NextResponse.json({ token, user });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
