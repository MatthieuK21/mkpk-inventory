import { NextRequest, NextResponse } from "next/server";
import { isAuthContext, requireAuth, canAccessLocation } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (!isAuthContext(auth)) return auth;

  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("item_comments")
      .select("*, user:app_users(id, name)")
      .eq("item_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ comments: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (!isAuthContext(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const userId = String(body.user_id ?? "").trim();
    const text = String(body.body ?? "").trim();

    if (!userId) {
      return NextResponse.json({ error: "Utilisateur requis" }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "Commentaire vide" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("item_comments")
      .insert({ item_id: id, user_id: userId, body: text })
      .select("*, user:app_users(id, name)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ comment: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
