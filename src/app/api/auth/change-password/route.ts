import { NextRequest, NextResponse } from "next/server";
import { isAuthContext, requireAuth } from "@/lib/auth";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/passwords";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createSessionToken } from "@/lib/session";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthContext(auth)) return auth;

  try {
    const body = await request.json();
    const currentPassword = String(body.currentPassword ?? "");
    const nextPassword = String(body.nextPassword ?? "");
    const strength = validatePassword(nextPassword);
    if (strength) {
      return NextResponse.json({ error: strength }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_users")
      .select("password_hash")
      .eq("id", auth.user.id)
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (data.password_hash) {
      const ok = await verifyPassword(currentPassword, data.password_hash);
      if (!ok) {
        return NextResponse.json(
          { error: "Mot de passe actuel incorrect" },
          { status: 401 },
        );
      }
    }

    const password_hash = await hashPassword(nextPassword);
    const { error: updateError } = await supabase
      .from("app_users")
      .update({ password_hash, must_change_password: false })
      .eq("id", auth.user.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const token = createSessionToken({
      id: auth.user.id,
      name: auth.user.name,
      login: auth.user.login,
      role: auth.user.role,
    });

    return NextResponse.json({
      ok: true,
      token,
      user: { ...auth.user, must_change_password: false, has_password: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
