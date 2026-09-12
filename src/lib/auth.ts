import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifySessionToken, type SessionPayload } from "@/lib/session";
import type { AuthUser, UserRole } from "@/lib/auth-types";
import { forbidden, unauthorized } from "@/lib/http";

export { unauthorized, forbidden } from "@/lib/http";

export type AuthContext = {
  user: AuthUser;
  session: SessionPayload;
  /** null = accès à tous les lieux (admin) */
  allowedLocations: string[] | null;
};

function readSessionToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim() || null;
  }
  return request.headers.get("x-inventory-session")?.trim() || null;
}

export async function loadAllowedLocations(
  userId: string,
  role: UserRole,
): Promise<string[] | null> {
  if (role === "admin") return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_location_grants")
    .select("location")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => String(row.location ?? "").trim())
    .filter(Boolean);
}

export function toAuthUser(row: {
  id: string;
  name: string;
  login: string | null;
  role: string | null;
  active: boolean | null;
  must_change_password: boolean | null;
  created_at: string;
  password_hash?: string | null;
  has_webauthn?: boolean;
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
    has_webauthn: Boolean(row.has_webauthn),
  };
}

export async function userHasWebauthn(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("webauthn_credentials")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function requireAuth(
  request: NextRequest,
): Promise<AuthContext | NextResponse> {
  const token = readSessionToken(request);
  const session = verifySessionToken(token);
  if (!session) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_users")
      .select(
        "id, name, login, role, active, must_change_password, created_at, password_hash",
      )
      .eq("id", session.sub)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const base = data ? toAuthUser(data) : null;
    if (!base || !base.active) return unauthorized();
    const user = {
      ...base,
      has_webauthn: await userHasWebauthn(base.id),
    };

    const allowedLocations = await loadAllowedLocations(user.id, user.role);
    return {
      user,
      session: {
        ...session,
        role: user.role,
        name: user.name,
        login: user.login,
      },
      allowedLocations,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur auth";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function requireAdmin(
  request: NextRequest,
): Promise<AuthContext | NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.role !== "admin") {
    return forbidden("Réservé à l'administrateur");
  }
  return auth;
}

export function isAuthContext(
  value: AuthContext | NextResponse,
): value is AuthContext {
  return !(value instanceof NextResponse);
}

/** Ancien verrou global (migration / bootstrap). */
export function checkPassword(request: NextRequest): boolean {
  const expected = process.env.INVENTORY_PASSWORD?.trim();
  if (!expected) return true;
  const provided = (
    request.headers.get("x-inventory-password") ??
    request.nextUrl.searchParams.get("password") ??
    ""
  ).trim();
  return provided === expected;
}

export function passwordRequired(): boolean {
  return Boolean(process.env.INVENTORY_PASSWORD?.trim());
}

export function canAccessLocation(
  auth: AuthContext,
  location: string | null | undefined,
): boolean {
  if (auth.allowedLocations === null) return true;
  const value = (location ?? "").trim();
  if (!value) return false;
  return auth.allowedLocations.includes(value);
}
