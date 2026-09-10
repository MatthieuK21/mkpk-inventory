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
