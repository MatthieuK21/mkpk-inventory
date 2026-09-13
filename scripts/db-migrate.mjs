#!/usr/bin/env node
/**
 * Applique les migrations SQL de supabase/migrations/ sur Postgres (Supabase).
 * Déclenché par Railway en pre-deploy — aucun GitHub Action.
 *
 * Variables :
 *   DATABASE_URL  (recommandé) connexion Postgres
 *   ou SUPABASE_DB_URL
 *
 * Usage : npm run db:migrate
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const migrationsDir = path.join(root, "supabase", "migrations");

const databaseUrl =
  process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();

if (!databaseUrl) {
  console.error(
    "[db:migrate] DATABASE_URL (ou SUPABASE_DB_URL) manquant — migrations ignorées.",
  );
  console.error(
    "  Ajoutez la connection string Postgres dans Railway (Supabase → Settings → Database).",
  );
  // Ne bloque pas le démarrage local / premier boot sans DB URL :
  // en prod Railway, on veut échouer pour ne pas servir un schéma périmé.
  if (process.env.REQUIRE_DB_MIGRATE === "1" || process.env.RAILWAY_ENVIRONMENT) {
    process.exit(1);
  }
  process.exit(0);
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

async function ensureMigrationsTable() {
  await client.query(`
    create table if not exists public.schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function appliedIds() {
  const { rows } = await client.query(
    `select id from public.schema_migrations order by id`,
  );
  return new Set(rows.map((r) => r.id));
}

function listMigrationFiles() {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Dossier introuvable: ${migrationsDir}`);
  }
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));
}

async function applyOne(filename) {
  const full = path.join(migrationsDir, filename);
  const sql = fs.readFileSync(full, "utf8");
  console.log(`[db:migrate] → ${filename}`);
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query(
      `insert into public.schema_migrations (id) values ($1) on conflict (id) do nothing`,
      [filename],
    );
    await client.query("commit");
    console.log(`[db:migrate] ✓ ${filename}`);
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

async function main() {
  console.log("[db:migrate] Connexion Postgres…");
  await client.connect();
  await ensureMigrationsTable();
  const done = await appliedIds();
  const files = listMigrationFiles();
  let applied = 0;
  for (const file of files) {
    if (done.has(file)) {
      console.log(`[db:migrate] skip ${file}`);
      continue;
    }
    await applyOne(file);
    applied += 1;
  }
  console.log(
    `[db:migrate] Terminé — ${applied} nouvelle(s), ${files.length} fichier(s) au total.`,
  );
  await client.end();
}

main().catch(async (err) => {
  console.error("[db:migrate] Échec:", err.message || err);
  try {
    await client.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
