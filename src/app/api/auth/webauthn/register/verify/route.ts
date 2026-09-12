import { NextRequest, NextResponse } from "next/server";
import { isAuthContext, requireAuth } from "@/lib/auth";
import { verifyRegistration } from "@/lib/webauthn";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthContext(auth)) return auth;

  try {
    const body = await request.json();
    const challengeId = String(body.challengeId ?? "");
    const response = body.response;
    if (!challengeId || !response) {
      return NextResponse.json({ error: "Réponse biométrique manquante" }, { status: 400 });
    }
    await verifyRegistration({
      request,
      challengeId,
      userId: auth.user.id,
      response,
      deviceLabel: body.deviceLabel ? String(body.deviceLabel) : undefined,
    });
    return NextResponse.json({
      ok: true,
      user: { ...auth.user, has_webauthn: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
