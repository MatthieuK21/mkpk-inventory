import { NextRequest, NextResponse } from "next/server";
import { checkPassword, unauthorized } from "@/lib/auth";
import { getPublicImageUrl, getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  if (!checkPassword(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const categoryId = request.nextUrl.searchParams.get("category");
    const q = request.nextUrl.searchParams.get("q")?.trim();

    let query = supabase
      .from("items")
      .select("*, category:categories(*)")
      .order("created_at", { ascending: false });

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    if (q) {
      query = query.or(
        `name.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%`,
      );
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (data ?? []).map((item) => ({
      ...item,
      image_url: getPublicImageUrl(item.image_path),
    }));

    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!checkPassword(request)) return unauthorized();

  try {
    const form = await request.formData();
    const file = form.get("file");
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const location = String(form.get("location") ?? "").trim();
    const quantity = Number(form.get("quantity") ?? 1);
    const categoryId = String(form.get("category_id") ?? "").trim() || null;

    if (!name) {
      return NextResponse.json({ error: "Le nom est obligatoire" }, { status: 400 });
    }

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Une image est obligatoire" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Le fichier doit être une image" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Image trop lourde (max 10 Mo)" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const imagePath = `${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("inventory")
      .upload(imagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("items")
      .insert({
        name,
        description: description || null,
        location: location || null,
        quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity : 1,
        category_id: categoryId,
        image_path: imagePath,
      })
      .select("*, category:categories(*)")
      .single();

    if (error) {
      await supabase.storage.from("inventory").remove([imagePath]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        item: {
          ...data,
          image_url: getPublicImageUrl(data.image_path),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
