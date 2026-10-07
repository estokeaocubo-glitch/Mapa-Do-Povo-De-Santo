// Camada de acesso ao banco.
//  • DATABASE_URL definida  → PostgreSQL real (Neon, Supabase, local) via `pg`.
//  • DATABASE_URL ausente   → PGlite (PostgreSQL em WebAssembly, em memória),
//    carregado com o MESMO db/schema.sql. Assim o projeto roda localmente sem
//    instalar nada, e as travas de privacidade (trigger + views) são as mesmas
//    da produção.
import { readFile } from 'node:fs/promises';

let dbPromise;

export function getDb() {
  if (!dbPromise) dbPromise = connect();
  return dbPromise;
}

async function connect() {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { default: pg } = await import('pg');
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    const pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL_MAX || 5),
      ssl: local || process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true },
    });
    return { query: (text, params) => pool.query(text, params), kind: 'postgres' };
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL não configurada em produção.');
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await db.exec(schema);
  console.warn('[db] DATABASE_URL ausente — usando PGlite em memória com os dados fictícios de db/schema.sql.');
  return { query: (text, params) => db.query(text, params), kind: 'pglite' };
}
