-- Propriétaire de l'objet
-- À exécuter dans Supabase SQL Editor

alter table public.items
  add column if not exists owner text
  check (owner is null or owner in ('Pierre', 'LUCEKA'));

create index if not exists items_owner_idx on public.items(owner);
