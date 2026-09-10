import { NextRequest, NextResponse } from "next/server";
import { checkPassword, unauthorized } from "@/lib/auth";
import {
  buildChanges,
  parsePrice,
  recordItemHistory,
} from "@/lib/history";
import { getPublicImageUrl, getSupabaseAdmin } from "@/lib/supabase";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!checkPassword(request)) return unauthorized();

  try {
    const { id } = await params;
    const body = await request.json();
    const userId =
      typeof body.user_id === "string" && body.user_id.trim()
        ? body.user_id.trim()
        : null;

    const updates: Record<string, unknown> = {};
    if (typeof body.name === "string") updates.name = body.name.trim();
    if (typeof body.description === "string") {
      updates.description = body.description.trim() || null;
    }
    if (typeof body.location === "string") {
      updates.location = body.location.trim() || null;
    }
    if (typeof body.quantity === "number") updates.quantity = body.quantity;
    if ("category_id" in body) {
      updates.category_id = body.category_id || null;
    }
    if ("estimated_price" in body) {
      updates.estimated_price = parsePrice(body.estimated_price);
    }
    if ("owner" in body) {
      const ownerRaw = String(body.owner ?? "").trim();
      updates.owner =
        ownerRaw === "Pierre" || ownerRaw === "LUCEKA" ? ownerRaw : null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Rien à mettre à jour" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: before, error: beforeError } = await supabase
      .from("items")
      .select("*")
      .eq("id", id)
      .single();

    if (beforeError || !before) {
      return NextResponse.json(
        { error: beforeError?.message || "Objet introuvable" },
        { status: 404 },
      );
    }

    const { data, error } = await supabase
      .from("items")
      .update(updates)
      .eq("id", id)
      .select("*, category:categories(*)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const changes = buildChanges(
      before as Record<string, unknown>,
      data as Record<string, unknown>,
      Object.keys(updates),
    );

    if (Object.keys(changes).length > 0) {
      await recordItemHistory(supabase, {
        itemId: id,
        userId,
        action: "updated",
        changes,
      });
    }

    return NextResponse.json({
      item: { ...data, image_url: getPublicImageUrl(data.image_path) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!checkPassword(request)) return unauthorized();

  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchError } = await supabase
      .from("items")
      .select("image_path")
      .eq("id", id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 404 });
    }

    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (existing?.image_path) {
      await supabase.storage.from("inventory").remove([existing.image_path]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
