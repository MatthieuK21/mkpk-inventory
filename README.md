# MKPK Inventaire

Site simple pour **uploader des photos**, les **enregistrer** et les **classer** (inventaire familial).

- **Frontend / API** : Next.js sur [Railway](https://railway.app)
- **Base + fichiers** : [Supabase](https://supabase.com) (Postgres + Storage)

## Fonctionnalités

- Upload d’images (glisser-déposer ou appareil photo)
- Nom, catégorie, lieu, quantité, description
- Galerie filtrable + recherche
- Création de catégories
- Mot de passe optionnel (`INVENTORY_PASSWORD`)

## 1. Créer le projet Supabase

1. Créez un projet sur [supabase.com](https://supabase.com)
2. Ouvrez **SQL Editor** et exécutez le contenu de [`supabase/schema.sql`](supabase/schema.sql)
3. Dans **Project Settings → API**, copiez :
   - **Project URL** → `SUPABASE_URL`
   - **service_role** (secret) → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Lancer en local

```bash
cp .env.example .env.local
# renseigner SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY

npm install
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000).

## 3. Déployer sur Railway

1. Poussez ce dépôt sur GitHub
2. Sur Railway : **New Project → Deploy from GitHub repo**
3. Ajoutez les variables d’environnement :
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `INVENTORY_PASSWORD` (optionnel mais recommandé)
4. Générez un domaine public (Settings → Networking → Generate Domain)

## Structure

```
src/app/              # pages + routes API
src/components/       # interface inventaire
supabase/schema.sql   # tables, bucket storage, catégories de départ
```

## Sécurité

L’app utilise la **service role** uniquement côté serveur (routes API).  
Le Storage bucket `inventory` est en lecture publique pour afficher les images.
