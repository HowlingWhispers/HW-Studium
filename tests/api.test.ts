import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { MemoryResearchRepository } from '../src/repository.js';
import type { ResearchBundle } from '../src/contracts.js';

describe('Studium API', () => {
  it('rejects research ingestion without the configured service secret', async () => {
    const response = await request(createApp({ ingestSecret: 'test-studium-secret' }))
      .post('/api/v1/bundles')
      .send({})
      .expect(401);
    expect(response.body.error).toBe('studium_ingest_unauthorized');
  });

  it('retracts an authenticated research bundle', async () => {
    const app = createApp({ ingestSecret: 'test-studium-secret' });
    const bundle = {
      schemaVersion: 'studium.bundle.v1',
      bundleId: 'speculus:session-1:turn-1',
      worldId: 'test-world',
      source: 'speculus',
      capturedAt: '2026-09-21T12:00:00.000Z',
      sanitized: true,
      records: [{
        recordId: 'speculus:v2:session-1:turn-1',
        occurredAt: '2026-09-21T11:00:00.000Z',
        kind: 'speculus_v2_turn',
        summary: 'test',
        evidence: [],
        signals: [],
        tags: [],
      }],
    };

    await request(app)
      .post('/api/v1/bundles')
      .set('Authorization', 'Bearer test-studium-secret')
      .send(bundle)
      .expect(201);

    const response = await request(app)
      .delete('/api/v1/bundles/speculus%3Asession-1%3Aturn-1')
      .set('Authorization', 'Bearer test-studium-secret')
      .expect(200);

    expect(response.body).toMatchObject({ ok: true, removed: true });
  });

  it('reports that it has no canon write access', async () => {
    const response = await request(createApp()).get('/health').expect(200);
    expect(response.body).toMatchObject({
      ok: true,
      service: 'studium',
      canonWriteAccess: false,
    });
  });

  it('rejects unsanitized research bundles', async () => {
    const response = await request(createApp({ ingestSecret: 'test-studium-secret' }))
      .post('/api/v1/bundles')
      .set('Authorization', 'Bearer test-studium-secret')
      .send({
        schemaVersion: 'studium.bundle.v1',
        bundleId: 'bundle-1',
        worldId: 'test-world',
        source: 'speculus',
        capturedAt: '2026-09-21T12:00:00.000Z',
        sanitized: false,
        records: [
          {
            recordId: 'record-1',
            occurredAt: '2026-09-21T11:00:00.000Z',
            kind: 'roleplay',
            summary: 'test',
          },
        ],
      })
      .expect(400);

    expect(response.body.error).toBe('invalid_research_bundle');
  });
});

describe('owner authorization boundary', () => {
  const authenticateOwner = async (token: string) => token === 'alice-token' ? { subject: 'alice', worldIds: ['world-a'] } : null;
  it('fails closed without owner configuration and denies service credentials on owner routes', async () => {
    await request(createApp()).get('/api/v1/worlds/world-a/proposals').expect(503);
    const app = createApp({ authenticateOwner, ingestSecret: 'service-token' });
    await request(app).get('/api/v1/worlds/world-a/proposals').set('Authorization', 'Bearer service-token').expect(401);
    await request(app).get('/api/v1/worlds/world-b/proposals').set('Authorization', 'Bearer alice-token').expect(403);
    await request(app).put('/api/v1/worlds/world-b/config').set('Authorization', 'Bearer alice-token').send({}).expect(403);
    await request(app).get('/api/v1/worlds/world-a/proposals').set('Authorization', 'Bearer alice-token').expect(200);
    await request(app).post('/api/v1/bundles').set('Authorization', 'Bearer alice-token').send({}).expect(401);
  });
});


describe('proposal review and evidence lifecycle over HTTP', () => {
  it('protects proposal identity, reopens changed accepted proposals, and blocks retracted evidence', async () => {
    const repository = new MemoryResearchRepository();
    const app = createApp({ repository, ingestSecret: 'service-token', authenticateOwner: async token =>
      token === 'alice' ? { subject: 'alice', worldIds: ['world-a'] } : token === 'bob' ? { subject: 'bob', worldIds: ['world-b'] } : null });
    const bundle: ResearchBundle = { schemaVersion: 'studium.bundle.v1', bundleId: 'bundle', worldId: 'world-a', source: 'speculus', capturedAt: 'now', sanitized: true,
      records: [1,2,3].map(n => ({ recordId: String(n), occurredAt: 'now', kind: 'turn', summary: 'Observation', evidence: [], tags: [],
        signals: [{ type: 'entity_candidate', key: 'station', label: 'Station', entityType: 'place', canonicalRefs: [] }] })) };
    await request(app).post('/api/v1/bundles').set('Authorization','Bearer service-token').send(bundle).expect(201);
    const analysis = await request(app).post('/api/v1/worlds/world-a/analyze').set('Authorization','Bearer alice').expect(200);
    const id = analysis.body.proposals[0].id;
    await request(app).patch(`/api/v1/proposals/${id}/status`).set('Authorization','Bearer bob').send({ status: 'accepted' }).expect(403);
    const accepted = await request(app).patch(`/api/v1/proposals/${id}/status`).set('Authorization','Bearer alice').send({ status: 'accepted' }).expect(200);
    expect(accepted.body.canonChanged).toBe(false);
    await request(app).post('/api/v1/bundles').set('Authorization','Bearer service-token').send(bundle).expect(200);
    const unchanged = await request(app).post('/api/v1/worlds/world-a/analyze').set('Authorization','Bearer alice').expect(200);
    expect(unchanged.body.proposals[0].status).toBe('accepted');
    bundle.records[0].summary = 'Rerolled observation';
    await request(app).post('/api/v1/bundles').set('Authorization','Bearer service-token').send(bundle).expect(200);
    await request(app).patch(`/api/v1/proposals/${id}/status`).set('Authorization','Bearer alice').send({ status: 'accepted' }).expect(409);
    const revised = await request(app).post('/api/v1/worlds/world-a/analyze').set('Authorization','Bearer alice').expect(200);
    expect(revised.body.proposals[0]).toMatchObject({ status: 'ready_for_review', evidenceStale: false });
    await request(app).delete('/api/v1/bundles/bundle').set('Authorization','Bearer service-token').expect(200);
    const retracted = await request(app).post('/api/v1/worlds/world-a/analyze').set('Authorization','Bearer alice').expect(200);
    expect(retracted.body.proposals).toEqual([]);
    await request(app).patch(`/api/v1/proposals/${id}/status`).set('Authorization','Bearer alice').send({ status: 'accepted' }).expect(409);
  });
});
