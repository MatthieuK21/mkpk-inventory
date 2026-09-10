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

-- Catégories de départ
insert into public.categories (name, color) values
  ('Meubles', '#2F6F5E'),
  ('Électroménager', '#3D5A80'),
  ('Décoration', '#B5651D'),
  ('Documents', '#5C5470'),
  ('Divers', '#6B7280')
on conflict (name) do nothing;
