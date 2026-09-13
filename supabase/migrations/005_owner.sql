-- Propriétaire de l'objet
-- À exécuter dans Supabase SQL Editor

alter table public.items
  add column if not exists owner text;

alter table public.items drop constraint if exists items_owner_check;

alter table public.items
  add constraint items_owner_check
  check (
    owner is null
    or owner in ('Pierre', 'LUCEKA', 'Gwladys', 'Célia', 'Lucie')
  );

create index if not exists items_owner_idx on public.items(owner);
