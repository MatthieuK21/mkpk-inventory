import { NextRequest, NextResponse } from "next/server";

export function unauthorized() {
  return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
}

export function checkPassword(request: NextRequest): boolean {
  const expected = process.env.INVENTORY_PASSWORD?.trim();
  if (!expected) return true;

  const provided = (
    request.headers.get("x-inventory-password") ??
    request.nextUrl.searchParams.get("password") ??
    ""
  ).trim();

  return provided === expected;
}

export function passwordRequired(): boolean {
  return Boolean(process.env.INVENTORY_PASSWORD?.trim());
}
