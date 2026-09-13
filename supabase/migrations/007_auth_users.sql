-- Gestion des utilisateurs, mots de passe, droits par lieu, WebAuthn
-- À exécuter dans Supabase → SQL Editor

alter table public.app_users
  add column if not exists login text,
  add column if not exists password_hash text,
  add column if not exists role text not null default 'user',
  add column if not exists active boolean not null default true,
  add column if not exists must_change_password boolean not null default false;

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users
  add constraint app_users_role_check
  check (role in ('admin', 'user'));

create unique index if not exists app_users_login_unique
  on public.app_users (lower(login))
  where login is not null;

create table if not exists public.user_location_grants (
  user_id uuid not null references public.app_users(id) on delete cascade,
  location text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, location)
);

create index if not exists user_location_grants_location_idx
  on public.user_location_grants (location);

alter table public.user_location_grants enable row level security;

create table if not exists public.webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_label text,
  created_at timestamptz not null default now()
);

create index if not exists webauthn_credentials_user_id_idx
  on public.webauthn_credentials (user_id);

alter table public.webauthn_credentials enable row level security;

create table if not exists public.webauthn_challenges (
  id text primary key,
  user_id uuid references public.app_users(id) on delete cascade,
  purpose text not null check (purpose in ('registration', 'authentication')),
  challenge text not null,
  expires_at timestamptz not null
);

create index if not exists webauthn_challenges_expires_idx
  on public.webauthn_challenges (expires_at);

alter table public.webauthn_challenges enable row level security;

update public.app_users
set
  login = coalesce(login, 'matthieu'),
  role = 'admin',
  active = true
where lower(name) = 'matthieu';

insert into public.app_users (name, login, role, active, must_change_password)
select 'Matthieu', 'matthieu', 'admin', true, true
where not exists (
  select 1 from public.app_users where lower(name) = 'matthieu'
);
