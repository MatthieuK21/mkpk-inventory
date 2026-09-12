import { NextRequest, NextResponse } from "next/server";
import {
  canAccessLocation,
  isAuthContext,
  requireAuth,
} from "@/lib/auth";
import {
  createLocation,
  findLocationById,
  findLocationByTitle,
  updateLocation,
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
      return NextResponse.json(
        {
          error:
            /relation .*locations.* does not exist/i.test(error.message)
              ? "Table locations absente. Exécutez supabase/locations.sql"
              : error.message,
        },
        { status: 500 },
      );
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

    const locations = (rows ?? [])
      .map((row) => {
        const title = String(row.title ?? "").trim();
        return {
          ...(row as LocationRecord),
          title,
          item_count: counts.get(title.toLowerCase()) ?? 0,
        };
      })
      .filter((loc) => loc.title && canAccessLocation(auth, loc.title))
      .sort((a, b) => a.title.localeCompare(b.title, "fr"));

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
    const title = String(body.title ?? "").trim();
    const address =
      body.address === undefined || body.address === null
        ? null
        : String(body.address);

    if (!title) {
      return NextResponse.json(
        { error: "Le titre du lieu est obligatoire" },
        { status: 400 },
      );
    }

    const location = await createLocation({ title, address });

    // Accorder automatiquement le lieu aux non-admins qui le créent
    if (auth.user.role !== "admin") {
      const supabase = getSupabaseAdmin();
      await supabase.from("user_location_grants").upsert({
        user_id: auth.user.id,
        location: location.title,
      });
    }

    return NextResponse.json({ location }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const status = /existe déjà/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthContext(auth)) return auth;

  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "id obligatoire" }, { status: 400 });
    }

    const current = await findLocationById(id);
    if (!current) {
      return NextResponse.json({ error: "Lieu introuvable" }, { status: 404 });
    }
    if (!canAccessLocation(auth, current.title)) {
      return NextResponse.json(
        { error: "Vous n'avez pas accès à ce lieu" },
        { status: 403 },
      );
    }

    const location = await updateLocation({
      id,
      title: typeof body.title === "string" ? body.title : undefined,
      address: "address" in body ? body.address : undefined,
    });

    return NextResponse.json({ location });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const status = /existe déjà|introuvable|obligatoire/i.test(message)
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
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
    const location =
      (id ? await findLocationById(id) : null) ??
      (title ? await findLocationByTitle(title) : null);

    if (!location) {
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
