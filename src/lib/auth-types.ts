import type { AppUser } from "@/lib/types";

export type UserRole = "admin" | "user";

export type AuthUser = AppUser & {
  login: string;
  role: UserRole;
  active: boolean;
  must_change_password: boolean;
  has_password: boolean;
  has_webauthn: boolean;
};

export type AdminUser = AuthUser & {
  locations: string[];
  webauthn_count: number;
};
