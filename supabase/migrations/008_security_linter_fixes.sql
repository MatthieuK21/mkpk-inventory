-- Corrections des avertissements du linter Supabase (catégorie SECURITY)
-- Réf. : https://supabase.com/docs/guides/database/database-linter
--
-- 1) 0011_function_search_path_mutable
--    La fonction trigger public.set_updated_at n'avait pas de search_path figé
--    (search_path "mutable" selon le rôle appelant). On le fixe à vide : le corps
--    n'utilise que now() (résolu depuis pg_catalog) et le pseudo-enregistrement NEW,
--    donc aucun schéma applicatif n'est nécessaire.
--
-- 2) 0025_public_bucket_allows_listing
--    La policy "Public read inventory images" accordait un SELECT large sur
--    storage.objects (bucket_id = 'inventory'), ce qui autorise le listing de tout
--    le bucket. Le bucket 'inventory' est public : les images sont servies via des
--    URLs d'objets publiques (/storage/v1/object/public/inventory/...), qui ne
--    dépendent d'aucune policy SELECT sur storage.objects. On retire donc cette
--    policy superflue et trop permissive.

-- 1) search_path figé sur la fonction trigger
alter function public.set_updated_at() set search_path = '';

-- 2) Suppression de la policy de lecture large du bucket public
drop policy if exists "Public read inventory images" on storage.objects;
