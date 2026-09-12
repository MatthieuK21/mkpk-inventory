import { NextRequest, NextResponse } from "next/server";
import {
  canAccessLocation,
  isAuthContext,
  requireAuth,
} from "@/lib/auth";
import {
  findLocationByTitle,
  upsertLocation,
  type LocationRecord,
} from "@/lib/locations";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthContext(auth)) return auth;

  try {
    const supabase = getSupabaseAdmin();

    const [{ data: rows, error }, { data: itemRows, error: itemError }] =
      await Promise.all([
        supabase
          .from("locations")
          .select("*")
          .order("title", { ascending: true }),
        supabase.from("items").select("location").not("location", "is", null),
      ]);

    if (error) {
      if (/relation .*locations.* does not exist/i.test(error.message)) {
        const titles = Array.from(
          new Set(
            (itemRows ?? [])
              .map((row) => String(row.location ?? "").trim())
              .filter(Boolean),
          ),
        )
          .filter((title) => canAccessLocation(auth, title))
          .sort((a, b) => a.localeCompare(b, "fr"));
        return NextResponse.json({
          locations: titles.map((title) => ({
            id: title,
            title,
            address: null as string | null,
            item_count: (itemRows ?? []).filter(
              (row) =>
                String(row.location ?? "").trim().toLowerCase() ===
                title.toLowerCase(),
            ).length,
          })),
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (itemError) {
      return NextResponse.json({ error: itemError.message }, { status: 500 });
    }

    const counts = new Map<string, number>();
    for (const row of itemRows ?? []) {
      const title = String(row.location ?? "").trim();
      if (!title) continue;
      const key = title.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const byTitle = new Map<string, LocationRecord>();
    for (const row of rows ?? []) {
      const title = String(row.title ?? "").trim();
      if (!title) continue;
      if (!canAccessLocation(auth, title)) continue;
      byTitle.set(title.toLowerCase(), {
        ...(row as LocationRecord),
        title,
        item_count: counts.get(title.toLowerCase()) ?? 0,
      });
    }

    for (const [key, count] of counts) {
      if (byTitle.has(key)) continue;
      const title =
        (itemRows ?? [])
          .map((row) => String(row.location ?? "").trim())
          .find((value) => value.toLowerCase() === key) ?? key;
      if (!canAccessLocation(auth, title)) continue;
      byTitle.set(key, {
        id: key,
        title,
        address: null,
        created_at: new Date(0).toISOString(),
        item_count: count,
      });
    }

    const locations = [...byTitle.values()].sort((a, b) =>
      a.title.localeCompare(b.title, "fr"),
    );

    return NextResponse.json({ locations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthContext(auth)) return auth;

  try {
    const body = await request.json();
    const title = String(body.title ?? body.location ?? "").trim();
    const address =
      body.address === undefined
        ? undefined
        : body.address === null
          ? null
          : String(body.address);

    if (!title) {
      return NextResponse.json(
        { error: "Le titre du lieu est obligatoire" },
        { status: 400 },
      );
    }
    if (!canAccessLocation(auth, title)) {
      return NextResponse.json(
        { error: "Vous n'avez pas accès à ce lieu" },
        { status: 403 },
      );
    }

    const location = await upsertLocation({ title, address });
    return NextResponse.json({ location }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthContext(auth)) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body.id ?? "").trim();
    const title = String(body.title ?? "").trim();

    const supabase = getSupabaseAdmin();
    let location =
      (id
        ? (
            await supabase
              .from("locations")
              .select("*")
              .eq("id", id)
              .maybeSingle()
          ).data
        : null) ?? (title ? await findLocationByTitle(title) : null);

    if (!location) {
      // Déjà absent de la table : considérer comme supprimé
      return NextResponse.json({ ok: true, deleted: { title } });
    }
    if (!canAccessLocation(auth, location.title)) {
      return NextResponse.json(
        { error: "Vous n'avez pas accès à ce lieu" },
        { status: 403 },
      );
    }

    const { count, error: countError } = await supabase
      .from("items")
      .select("*", { count: "exact", head: true })
      .ilike("location", location.title);
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `Ce lieu contient encore ${count} objet(s)` },
        { status: 409 },
      );
    }

    const { error } = await supabase
      .from("locations")
      .delete()
      .eq("id", location.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase
      .from("user_location_grants")
      .delete()
      .ilike("location", location.title);

    return NextResponse.json({ ok: true, deleted: location });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
