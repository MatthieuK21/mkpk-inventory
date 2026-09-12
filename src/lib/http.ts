import { NextResponse } from "next/server";

export function unauthorized(message = "Non autorisé") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Accès refusé") {
  return NextResponse.json({ error: message }, { status: 403 });
}
