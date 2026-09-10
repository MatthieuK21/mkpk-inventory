-- MKPK Inventaire — schéma Supabase
-- À exécuter dans : Supabase Dashboard → SQL Editor → New query

-- Catégories de classement
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#2F6F5E',
  created_at timestamptz not null default now()
);

-- Objets d'inventaire
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  location text,
  quantity integer not null default 1 check (quantity >= 0),
  category_id uuid references public.categories(id) on delete set null,
  image_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists items_category_id_idx on public.items(category_id);
create index if not exists items_name_idx on public.items using gin (to_tsvector('french', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(location, '')));

-- Mise à jour auto de updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- Bucket Storage pour les photos
insert into storage.buckets (id, name, public)
values ('inventory', 'inventory', true)
on conflict (id) do nothing;

-- Politiques : l'app utilise la service role côté serveur (bypass RLS).
-- RLS activé pour bloquer l'accès anonyme direct depuis le client.
alter table public.categories enable row level security;
alter table public.items enable row level security;

-- Lecture publique des images du bucket (URLs publiques)
drop policy if exists "Public read inventory images" on storage.objects;
create policy "Public read inventory images"
  on storage.objects for select
  using (bucket_id = 'inventory');

-- Catégories de départ (inventaire maison)
insert into public.categories (name, color) values
  ('Meubles', '#2F6F5E'),
  ('Électroménager', '#3D5A80'),
  ('Électronique', '#1B6CA8'),
  ('Informatique', '#2563EB'),
  ('Téléphonie', '#0E7490'),
  ('Audio / Vidéo', '#4338CA'),
  ('Éclairage', '#CA8A04'),
  ('Décoration', '#B5651D'),
  ('Art / Cadres', '#A16207'),
  ('Cuisine / Ustensiles', '#C2410C'),
  ('Vaisselle', '#EA580C'),
  ('Alimentation / Réserves', '#D97706'),
  ('Cave / Boissons', '#92400E'),
  ('Linge de maison', '#DB2777'),
  ('Literie', '#BE185D'),
  ('Vêtements', '#9D174D'),
  ('Chaussures', '#831843'),
  ('Bijoux / Montres', '#A21CAF'),
  ('Accessoires', '#7E22CE'),
  ('Salle de bain', '#0891B2'),
  ('Hygiène / Beauté', '#0D9488'),
  ('Pharmacie / Santé', '#059669'),
  ('Entretien / Ménage', '#4D7C0F'),
  ('Outillage / Bricolage', '#65A30D'),
  ('Quincaillerie', '#84CC16'),
  ('Jardin / Extérieur', '#16A34A'),
  ('Sport / Loisirs', '#15803D'),
  ('Jeux / Jouets', '#F59E0B'),
  ('Puériculture', '#F97316'),
  ('Livres / Médias', '#7C3AED'),
  ('Instruments de musique', '#8B5CF6'),
  ('Collections', '#C026D3'),
  ('Documents', '#5C5470'),
  ('Administratif / Assurances', '#6B7280'),
  ('Clés / Badges', '#57534E'),
  ('Sécurité', '#44403C'),
  ('Chauffage / Clim', '#DC2626'),
  ('Véhicules / Deux-roues', '#B91C1C'),
  ('Animaux', '#78716C'),
  ('Voyage / Bagages', '#0F766E'),
  ('Divers', '#6B7280')
on conflict (name) do nothing;
-- Utilisateurs famille + commentaires par objet
-- À exécuter dans Supabase SQL Editor (ou déjà appliqué via script)

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.item_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists item_comments_item_id_idx on public.item_comments(item_id);
create index if not exists item_comments_user_id_idx on public.item_comments(user_id);

alter table public.app_users enable row level security;
alter table public.item_comments enable row level security;

insert into public.app_users (name) values
  ('Matthieu'),
  ('Invité')
on conflict (name) do nothing;
