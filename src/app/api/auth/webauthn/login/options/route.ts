import { NextRequest, NextResponse } from "next/server";
import { ensureAdminBootstrap } from "@/lib/bootstrap-admin";
import { createAuthenticationOptions } from "@/lib/webauthn";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    await ensureAdminBootstrap();
    const body = await request.json().catch(() => ({}));
    const login = String(body.login ?? "").trim().toLowerCase();

    let userId: string | undefined;
    if (login) {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("app_users")
        .select("id, active")
        .ilike("login", login)
        .maybeSingle();
      if (!data || data.active === false) {
        return NextResponse.json(
          { error: "Aucun compte biométrique pour cet identifiant" },
          { status: 404 },
        );
      }
      userId = data.id;
    }

    const { options, challengeId } = await createAuthenticationOptions({
      request,
      userId,
    });
    return NextResponse.json({ options, challengeId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
