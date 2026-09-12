import { NextRequest, NextResponse } from "next/server";
import { isAuthContext, requireAdmin } from "@/lib/auth";
import { hashPassword, validatePassword } from "@/lib/passwords";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { AdminUser, AuthUser, UserRole } from "@/lib/auth-types";

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
  };
}

async function enrichUsers(users: AuthUser[]): Promise<AdminUser[]> {
  if (users.length === 0) return [];
  const supabase = getSupabaseAdmin();
  const ids = users.map((user) => user.id);
  const [{ data: grants }, { data: creds }] = await Promise.all([
    supabase
      .from("user_location_grants")
      .select("user_id, location")
      .in("user_id", ids),
    supabase.from("webauthn_credentials").select("user_id").in("user_id", ids),
  ]);

  const locMap = new Map<string, string[]>();
  for (const row of grants ?? []) {
    const list = locMap.get(row.user_id) ?? [];
    list.push(String(row.location));
    locMap.set(row.user_id, list);
  }

  const credCount = new Map<string, number>();
  for (const row of creds ?? []) {
    credCount.set(row.user_id, (credCount.get(row.user_id) ?? 0) + 1);
  }

  return users.map((user) => ({
    ...user,
    locations: (locMap.get(user.id) ?? []).sort((a, b) =>
      a.localeCompare(b, "fr"),
    ),
    webauthn_count: credCount.get(user.id) ?? 0,
  }));
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!isAuthContext(auth)) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_users")
    .select(
      "id, name, login, role, active, must_change_password, created_at, password_hash",
    )
    .order("name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = (data ?? [])
    .map((row) => toAuthUser(row))
    .filter((user): user is AuthUser => Boolean(user));

  return NextResponse.json({ users: await enrichUsers(users) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!isAuthContext(auth)) return auth;

  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const login = String(body.login ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const role: UserRole = body.role === "admin" ? "admin" : "user";
    const locations = Array.isArray(body.locations)
      ? body.locations
          .map((value: unknown) => String(value).trim())
          .filter(Boolean)
      : [];

    if (!name || !login) {
      return NextResponse.json(
        { error: "Nom et identifiant requis" },
        { status: 400 },
      );
    }
    const strength = validatePassword(password);
    if (strength) {
      return NextResponse.json({ error: strength }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const password_hash = await hashPassword(password);
    const { data, error } = await supabase
      .from("app_users")
      .insert({
        name,
        login,
        password_hash,
        role,
        active: true,
        must_change_password: Boolean(body.must_change_password),
      })
      .select(
        "id, name, login, role, active, must_change_password, created_at, password_hash",
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const user = toAuthUser(data);
    if (!user) {
      return NextResponse.json({ error: "Création invalide" }, { status: 500 });
    }

    if (role !== "admin" && locations.length > 0) {
      const { error: grantError } = await supabase
        .from("user_location_grants")
        .insert(
          locations.map((location: string) => ({
            user_id: user.id,
            location,
          })),
        );
      if (grantError) {
        return NextResponse.json({ error: grantError.message }, { status: 500 });
      }
    }

    const [enriched] = await enrichUsers([user]);
    return NextResponse.json({ user: enriched }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
