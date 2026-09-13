-- Prix estimé + historique des modifications
-- À exécuter dans Supabase SQL Editor

alter table public.items
  add column if not exists estimated_price numeric(12, 2);

create table if not exists public.item_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete set null,
  action text not null check (action in ('created', 'updated')),
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists item_history_item_id_idx
  on public.item_history(item_id, created_at desc);

alter table public.item_history enable row level security;
