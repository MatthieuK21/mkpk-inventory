-- Correction du linter Supabase 0008_rls_enabled_no_policy (catégorie SECURITY, INFO)
-- Réf. : https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
--
-- Contexte : toutes les tables applicatives ont RLS activé mais AUCUNE policy,
-- ce qui bloque déjà tout accès direct via l'API Data (rôles anon/authenticated).
-- L'application n'accède JAMAIS aux tables via anon/authenticated : tout passe par
-- la service role côté serveur (getSupabaseAdmin) et par le rôle postgres pour les
-- migrations — deux rôles qui *bypassent* RLS (rolbypassrls = true). Le client web
-- n'utilise pas @supabase/supabase-js directement, il passe par les routes API.
--
-- On matérialise donc explicitement cette intention par une policy "deny-all" pour
-- anon/authenticated : le comportement est inchangé (accès direct toujours refusé),
-- mais le linter voit une policy et l'avertissement disparaît. La service role et
-- postgres continuent de fonctionner (bypass RLS).

do $$
declare
  t text;
  policy_name constant text := 'Deny anon and authenticated';
  tables constant text[] := array[
    'app_users',
    'categories',
    'item_comments',
    'item_history',
    'items',
    'locations',
    'schema_migrations',
    'user_location_grants',
    'webauthn_challenges',
    'webauthn_credentials'
  ];
begin
  foreach t in array tables loop
    -- Ignore une table absente (défensif ; toutes existent normalement)
    if to_regclass('public.' || quote_ident(t)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', policy_name, t);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (false) with check (false)',
      policy_name, t
    );
  end loop;
end $$;
