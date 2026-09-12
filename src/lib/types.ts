export type Category = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};

export type AppUser = {
  id: string;
  name: string;
  created_at: string;
};

export type { AuthUser, UserRole, AdminUser } from "@/lib/auth-types";

export type ItemComment = {
  id: string;
  item_id: string;
  user_id: string;
  body: string;
  created_at: string;
  user?: AppUser | null;
};

export type ItemHistoryEntry = {
  id: string;
  item_id: string;
  user_id: string | null;
  action: "created" | "updated";
  changes: Record<string, { from: unknown; to: unknown }>;
  created_at: string;
  user?: AppUser | null;
  change_labels?: string[];
};

export const ITEM_OWNERS = [
  "Pierre",
  "LUCEKA",
  "Gwladys",
  "Célia",
  "Lucie",
] as const;

export type ItemOwner = (typeof ITEM_OWNERS)[number];

export function isItemOwner(value: string): value is ItemOwner {
  return (ITEM_OWNERS as readonly string[]).includes(value);
}

export type InventoryItem = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  quantity: number;
  estimated_price: number | null;
  owner: ItemOwner | null;
  category_id: string | null;
  image_path: string;
  created_at: string;
  updated_at: string;
  image_url?: string;
  category?: Category | null;
};

export type ItemInput = {
  name: string;
  description?: string;
  location?: string;
  quantity?: number;
  estimated_price?: number | null;
  owner?: ItemOwner | null;
  category_id?: string | null;
};
