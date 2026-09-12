import { NextRequest, NextResponse } from "next/server";
import { isAuthContext, requireAuth, canAccessLocation } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fieldLabel } from "@/lib/history";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (!isAuthContext(auth)) return auth;

  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("item_history")
      .select("*, user:app_users(id, name)")
      .eq("item_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const history = (data ?? []).map((row) => ({
      ...row,
      change_labels: Object.keys(row.changes ?? {}).map(fieldLabel),
    }));

    return NextResponse.json({ history });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
