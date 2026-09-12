import { NextResponse } from "next/server";
import { ensureAdminBootstrap } from "@/lib/bootstrap-admin";

export async function GET() {
  try {
    await ensureAdminBootstrap();
  } catch {
    // bootstrap best-effort; login will retry
  }

  return NextResponse.json({
    authMode: "users",
    configured: Boolean(
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    webauthn: true,
  });
}
