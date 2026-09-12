"use client";

import type { AuthUser } from "@/lib/auth-types";

const TOKEN_KEY = "mkpk-inventory-session";
const USER_KEY = "mkpk-inventory-auth-user";

export function readSessionToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeSession(token: string, user: AuthUser) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

export function readStoredAuthUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function sessionHeaders(token = readSessionToken()): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
