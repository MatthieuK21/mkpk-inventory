import { NextRequest, NextResponse } from "next/server";
import { isAuthContext, requireAuth } from "@/lib/auth";
import { createRegistrationOptions } from "@/lib/webauthn";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthContext(auth)) return auth;

  try {
    const { options, challengeId } = await createRegistrationOptions({
      request,
      userId: auth.user.id,
      userName: auth.user.login,
      userDisplayName: auth.user.name,
    });
    return NextResponse.json({ options, challengeId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
