import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

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
