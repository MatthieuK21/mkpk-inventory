import { NextRequest, NextResponse } from "next/server";
import { isAuthContext, requireAuth } from "@/lib/auth";
import { loadAllowedLocations } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthContext(auth)) return auth;

  const locations =
    auth.allowedLocations === null
      ? null
      : await loadAllowedLocations(auth.user.id, auth.user.role);

  return NextResponse.json({
    user: auth.user,
    allowedLocations: locations,
  });
}
