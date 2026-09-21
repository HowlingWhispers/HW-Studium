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
