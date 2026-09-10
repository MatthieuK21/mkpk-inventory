import { NextResponse } from "next/server";
import { passwordRequired } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({
    passwordRequired: passwordRequired(),
    configured: Boolean(
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  });
}
