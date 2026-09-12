import { NextRequest, NextResponse } from "next/server";
import { createSessionToken } from "@/lib/session";
import { verifyAuthentication } from "@/lib/webauthn";
import type { AuthUser } from "@/lib/auth-types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const challengeId = String(body.challengeId ?? "");
    const response = body.response;
    if (!challengeId || !response) {
      return NextResponse.json({ error: "Réponse biométrique manquante" }, { status: 400 });
    }

    const row = await verifyAuthentication({
      request,
      challengeId,
      response,
    });

    const user: AuthUser = {
      id: row.id,
      name: row.name,
      login: row.login,
      role: row.role === "admin" ? "admin" : "user",
      active: row.active !== false,
      must_change_password: Boolean(row.must_change_password),
      created_at: row.created_at,
      has_password: Boolean(row.password_hash),
    };

    const token = createSessionToken({
      id: user.id,
      name: user.name,
      login: user.login,
      role: user.role,
    });

    return NextResponse.json({ token, user });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
