# Règles agent MKPK (hors bloc Next.js)

Ce fichier complète le bloc Next.js éventuellement réécrit dans `AGENTS.md`.

## Automatisation demandée par le propriétaire

- À chaque développement / correctif / idée implémentée : **ouvrir une PR automatiquement** (pas en draft).
- **Merger la PR** dès qu’elle est mergeable, sans attendre un clic utilisateur.
- Toute évolution de base : fichier dans `supabase/migrations/` ; application **auto** au deploy Railway (`db:migrate`). Pas de SQL manuel ni GitHub Actions.

Détail : `.cursor/rules/auto-pr-workflow.mdc`
