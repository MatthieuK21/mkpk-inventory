export type Category = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  quantity: number;
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
  category_id?: string | null;
};
