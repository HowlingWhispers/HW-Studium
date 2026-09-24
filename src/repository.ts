import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import type { Pool } from 'pg';
import { StudiumStore, type StoreDocument } from './store.js';

export interface HistoryEntry {
  sequence: string;
  kind: string;
  id: string;
  actor: string;
  action: string;
  before_value: unknown;
  after_value: unknown;
  occurred_at: string;
}
export interface ResearchRepository {
  run<T>(worldId: string, actor: string, work: (store: StudiumStore) => T): Promise<T>;
  findWorld(kind: string, id: string): Promise<string | null>;
  history(worldId: string, after?: string): Promise<HistoryEntry[]>;
}
export interface SqlConnection {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  release(): void;
}
export interface SqlPool { connect(): Promise<SqlConnection> }

// One connection and world lock cover read/analysis/write, preventing lost rerolls
// or a status change racing with proposal regeneration across server instances.
export class PostgresResearchRepository implements ResearchRepository {
  constructor(private pool: SqlPool | Pool) {}

  async migrate() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(4310, 1)');
      await client.query('CREATE TABLE IF NOT EXISTS studium_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      for (const [version, file] of [[1, '001_research.sql'], [2, '002_semantic_analysis.sql']] as const) {
        const result = await client.query('SELECT version FROM studium_migrations WHERE version = $1', [version]);
        if (!result.rows.length) {
          await client.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
          await client.query('INSERT INTO studium_migrations(version) VALUES ($1)', [version]);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async run<T>(worldId: string, actor: string, work: (store: StudiumStore) => T): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO studium_worlds(world_id) VALUES ($1) ON CONFLICT DO NOTHING', [worldId]);
      await client.query('SELECT world_id FROM studium_worlds WHERE world_id = $1 FOR UPDATE', [worldId]);
      const result = await client.query('SELECT kind, id, payload, retracted_at FROM studium_documents WHERE world_id = $1 ORDER BY created_at, id', [worldId]);
      const previous = new Map(result.rows.map(row => [`${row.kind}:${row.id}`, row]));
      const store = new StudiumStore(result.rows.filter(row => !row.retracted_at).map(row => ({ kind: row.kind, id: row.id, value: row.payload })));
      const value = work(store);
      if (value instanceof Promise) throw new Error('repository_callback_must_be_synchronous');
      const next = new Map(store.documents().map(doc => [`${doc.kind}:${doc.id}`, doc]));
      for (const key of new Set([...previous.keys(), ...next.keys()])) {
        const before = previous.get(key);
        const after = next.get(key);
        if (!after && before?.retracted_at) continue;
        if (after && before && !before.retracted_at && isDeepStrictEqual(before.payload, after.value)) continue;
        const kind = after?.kind ?? before.kind;
        const id = after?.id ?? before.id;
        const action = !after ? 'retract' : !before ? 'create' : before.retracted_at ? 'restore' : 'replace';
        if (after) {
          const saved = await client.query(`INSERT INTO studium_documents(kind,id,world_id,payload) VALUES ($1,$2,$3,$4::jsonb)
            ON CONFLICT (kind,id) DO UPDATE SET payload=EXCLUDED.payload, updated_at=now(), retracted_at=NULL
            WHERE studium_documents.world_id=EXCLUDED.world_id RETURNING id`, [kind, id, worldId, JSON.stringify(after.value)]);
          if (!saved.rows.length) throw new Error('document_world_conflict');
        } else {
          await client.query('UPDATE studium_documents SET retracted_at=now(), updated_at=now() WHERE kind=$1 AND id=$2 AND world_id=$3', [kind, id, worldId]);
        }
        await client.query(`INSERT INTO studium_history(world_id,kind,id,actor,action,before_value,after_value)
          VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`, [worldId, kind, id, actor, action, before ? JSON.stringify(before.payload) : null, after ? JSON.stringify(after.value) : null]);
      }
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async findWorld(kind: string, id: string): Promise<string | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT world_id FROM studium_documents WHERE kind=$1 AND id=$2 AND retracted_at IS NULL', [kind, id]);
      return result.rows[0]?.world_id ?? null;
    } finally { client.release(); }
  }

  async history(worldId: string, after = '0'): Promise<HistoryEntry[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT sequence::text, kind, id, actor, action, before_value, after_value, occurred_at FROM studium_history WHERE world_id=$1 AND sequence > $2::bigint ORDER BY sequence LIMIT 100', [worldId, after]);
      return result.rows;
    } finally { client.release(); }
  }
}

// Explicit test/development adapter only. The executable server requires PostgreSQL.
export class MemoryResearchRepository implements ResearchRepository {
  private worlds = new Map<string, StoreDocument[]>();
  async run<T>(worldId: string, _actor: string, work: (store: StudiumStore) => T): Promise<T> {
    const store = new StudiumStore(this.worlds.get(worldId));
    const value = work(store);
    const documents = store.documents();
    for (const [otherWorld, existing] of this.worlds) {
      if (otherWorld !== worldId && documents.some(doc => existing.some(old => old.kind === doc.kind && old.id === doc.id))) throw new Error('document_world_conflict');
    }
    this.worlds.set(worldId, documents);
    return value;
  }
  async findWorld(kind: string, id: string) {
    for (const [worldId, docs] of this.worlds) if (docs.some(doc => doc.kind === kind && doc.id === id)) return worldId;
    return null;
  }
  async history(): Promise<HistoryEntry[]> { return []; }
}
