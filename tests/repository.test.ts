import { analyzeStoredResearch } from '../src/semantic-service.js';
import { MockSemanticAnalyst } from '../src/semantic-analyst.js';
import { bundleFixture, inputFixture, resultFixture, claimFixture } from './semantic-fixtures.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PostgresResearchRepository, type SqlPool } from '../src/repository.js';
import { analyzeWorld } from '../src/analyzer.js';
import { createWeeklyWorldReport } from '../src/report.js';
import type { ResearchBundle } from '../src/contracts.js';

function bundle(worldId = 'world-a', summary = 'Initial observation'): ResearchBundle {
  return { schemaVersion: 'studium.bundle.v1', bundleId: 'bundle-1', worldId, source: 'speculus', capturedAt: '2026-09-24T00:00:00Z', sanitized: true,
    records: [1,2,3].map(n => ({ recordId: `record-${n}`, occurredAt: '2026-09-24T00:00:00Z', kind: 'turn', summary, evidence: [], tags: [],
      signals: [{ type: 'entity_candidate', key: 'station', label: 'Station', entityType: 'place', canonicalRefs: [] }] })) };
}

describe('PostgreSQL research persistence', () => {
  let directory: string;
  let close: () => Promise<void>;
  let repository: PostgresResearchRepository;
  async function open() {
    let pool: SqlPool;
    if (process.env.STUDIUM_TEST_DATABASE_URL) {
      const pg = new Pool({ connectionString: process.env.STUDIUM_TEST_DATABASE_URL });
      pool = pg;
      close = () => pg.end();
    } else {
      const db = new PGlite(directory);
      await db.waitReady;
      pool = { connect: async () => ({ query: async (sql, params) => {
        if (!params && sql.includes(';')) { await db.exec(sql); return { rows: [] }; }
        return db.query(sql, params);
      }, release() {} }) };
      close = () => db.close();
    }
    repository = new PostgresResearchRepository(pool);
    await repository.migrate();
  }
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'studium-'));
    if (process.env.STUDIUM_TEST_DATABASE_URL) {
      const pool = new Pool({ connectionString: process.env.STUDIUM_TEST_DATABASE_URL });
      await pool.query('DROP TABLE IF EXISTS studium_history, studium_documents, studium_worlds, studium_migrations CASCADE');
      await pool.end();
    }
    await open();
  }, 30000);
  afterEach(async () => { await close(); await rm(directory, { recursive: true, force: true }); });

  it('survives connection/process-state loss with config, evidence, review status, reports and history', async () => {
    let proposalId = '';
    await repository.run('world-a', 'owner:alice', store => {
      store.setWorldConfig({ worldId: 'world-a', enabled: true, mode: 'balanced', reviewCadence: 'manual', retention: { reviewAfterDays: 90, legalHold: true } });
      store.addBundle(bundle());
      const proposals = store.reconcileProposals('world-a', analyzeWorld('world-a', bundle().records, store.getWorldConfig('world-a')));
      proposalId = proposals[0].id;
      store.updateProposalStatus(proposalId, 'accepted');
      store.addReport(createWeeklyWorldReport('world-a', [bundle()], proposals));
    });
    await close(); await open();
    await repository.run('world-a', 'owner:alice', store => {
      expect(store.listBundlesForWorld('world-a')).toHaveLength(1);
      expect(store.getWorldConfig('world-a').retention?.legalHold).toBe(true);
      expect(store.getProposal(proposalId)?.status).toBe('accepted');
      expect(store.latestReport('world-a')?.recordCount).toBe(3);
      expect(store.latestReport('world-a')?.id).toBeTruthy();
    });
    expect((await repository.history('world-a')).map(row => row.kind).sort()).toEqual(['bundle','config','proposal','report']);
  }, 30000);

  it('is idempotent, retains reroll revisions, retracts durably and blocks stale acceptance', async () => {
    await repository.run('world-a', 'service:ingest', store => store.addBundle(bundle()));
    await repository.run('world-a', 'service:ingest', store => expect(store.addBundle(bundle())).toEqual({ inserted: false, updated: false }));
    expect(await repository.history('world-a')).toHaveLength(1);
    const proposals = await repository.run('world-a', 'owner:alice', store => store.reconcileProposals('world-a', analyzeWorld('world-a', bundle().records, store.getWorldConfig('world-a'))));
    await repository.run('world-a', 'owner:alice', store => store.updateProposalStatus(proposals[0].id, 'deferred'));
    await repository.run('world-a', 'service:ingest', store => store.addBundle(bundle('world-a', 'Rerolled observation')));
    await expect(repository.run('world-a', 'owner:alice', store => store.updateProposalStatus(proposals[0].id, 'accepted'))).rejects.toThrow('proposal_evidence_stale');
    await repository.run('world-a', 'service:ingest', store => store.removeBundle('bundle-1'));
    await close(); await open();
    expect(await repository.findWorld('bundle', 'bundle-1')).toBeNull();
    await repository.run('world-a', 'owner:alice', store => {
      expect(store.listBundlesForWorld('world-a')).toEqual([]);
      expect(store.reconcileProposals('world-a', [])).toEqual([]);
      expect(store.getProposal(proposals[0].id)).toMatchObject({ status: 'deferred', evidenceStale: true });
    });
    const history = await repository.history('world-a');
    expect(history.filter(row => row.kind === 'bundle').map(row => row.action)).toEqual(['create','replace','retract']);
    expect((history.find(row => row.action === 'retract')?.before_value as ResearchBundle).records[0].summary).toBe('Rerolled observation');
    await repository.run('world-a', 'service:ingest', store => store.addBundle(bundle()));
    expect((await repository.history('world-a')).at(-1)?.action).toBe('restore');
  }, 30000);

  it('rolls back failures and rejects cross-world identity takeover', async () => {
    await repository.run('world-a', 'service:ingest', store => store.addBundle(bundle()));
    await expect(repository.run('world-b', 'service:ingest', store => store.addBundle(bundle('world-b')))).rejects.toThrow('document_world_conflict');
    await expect(repository.run('world-a', 'owner:alice', store => { store.removeBundle('bundle-1'); throw new Error('abort'); })).rejects.toThrow('abort');
    expect(await repository.findWorld('bundle','bundle-1')).toBe('world-a');
    expect(await repository.history('world-b')).toEqual([]);
    expect(await repository.history('world-a')).toHaveLength(1);
  });

  it('persists validated semantic results across restart and audits invalidation', async () => {
    await repository.run('world-a', 'service:ingest', store => store.addBundle(bundleFixture()));
    const analysis = await analyzeStoredResearch({ repository, worldId: 'world-a', actor: 'owner:alice',
      analyst: new MockSemanticAnalyst('test-v1', resultFixture([claimFixture('character_belief')])), context: { resolve: async () => inputFixture() } });
    await close(); await open();
    const stored = await repository.run('world-a', 'owner:alice', store => store.listSemanticAnalyses('world-a'));
    expect(stored).toEqual([analysis]);
    await repository.run('world-a', 'service:ingest', store => store.removeBundle('bundle-a'));
    expect((await repository.run('world-a', 'owner:alice', store => store.listSemanticAnalyses('world-a')))[0].evidenceStale).toBe(true);
    expect((await repository.history('world-a')).filter(row => row.kind === 'analysis').map(row => row.action)).toEqual(['create', 'replace']);
  }, 30000);

  it.skipIf(!process.env.STUDIUM_TEST_DATABASE_URL)('serializes concurrent server instances without lost evidence', async () => {
    await Promise.all(Array.from({ length: 8 }, (_, n) => repository.run('world-a', 'service:ingest', store => store.addBundle({ ...bundle(), bundleId: `bundle-${n}` }))));
    const count = await repository.run('world-a', 'owner:alice', store => store.listBundlesForWorld('world-a').length);
    expect(count).toBe(8);
    expect(await repository.history('world-a')).toHaveLength(8);
  });
});
