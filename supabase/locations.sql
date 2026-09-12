-- Lieux avec titre + adresse
-- À exécuter dans Supabase → SQL Editor

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists locations_title_unique
  on public.locations (lower(title));

create index if not exists locations_title_idx
  on public.locations (title);

alter table public.locations enable row level security;

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

-- Importer les lieux déjà présents sur les objets
insert into public.locations (title, address)
select distinct trim(location), null
from public.items
where location is not null
  and trim(location) <> ''
  and not exists (
    select 1
    from public.locations l
    where lower(l.title) = lower(trim(items.location))
  );
