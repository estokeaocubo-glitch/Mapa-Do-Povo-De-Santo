// Substituto mínimo do Cloudflare D1 para testes, usando o SQLite nativo do
// Node (node:sqlite). Aplica as MESMAS migrações de produção, então CHECKs,
// gatilhos e views são testados de verdade.
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

class Declaracao {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...params) { return new Declaracao(this.db, this.sql, params); }
  async all() { return { results: this.db.prepare(this.sql).all(...this.params).map((r) => ({ ...r })), success: true }; }
  async first() { const r = this.db.prepare(this.sql).get(...this.params); return r ? { ...r } : null; }
  async run() { this.db.prepare(this.sql).run(...this.params); return { success: true }; }
}

export function criarD1() {
  const db = new DatabaseSync(':memory:');
  const pasta = new URL('../migrations/', import.meta.url);
  for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(new URL(arquivo, pasta), 'utf8'));
  }
  return {
    bruto: db,
    prepare: (sql) => new Declaracao(db, sql),
    async batch(lista) { const r = []; for (const d of lista) r.push(await d.run()); return r; },
  };
}
