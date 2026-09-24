import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { MemoryResearchRepository } from '../src/repository.js';
import { MockSemanticAnalyst } from '../src/semantic-analyst.js';
import { analyzeStoredResearch } from '../src/semantic-service.js';
import { bundleFixture, claimFixture, inputFixture, resultFixture } from './semantic-fixtures.js';

async function setup() {
  const repository = new MemoryResearchRepository();
  await repository.run('world-a', 'service:ingest', store => store.addBundle(bundleFixture()));
  return { repository, worldId: 'world-a', actor: 'owner:alice', analyst: new MockSemanticAnalyst('test-v1', resultFixture([claimFixture('character_belief')])), context: { resolve: async () => inputFixture() } };
}
describe('semantic storage boundary', () => {
  it('stores only validated advisory results and invalidates them after retraction', async () => {
    const options = await setup();
    const result = await analyzeStoredResearch(options);
    expect(result.result.claims[0].claim.classification).toBe('character_belief');
    await options.repository.run('world-a', 'service:ingest', store => store.removeBundle('bundle-a'));
    const stored = await options.repository.run('world-a', 'owner:alice', store => store.listSemanticAnalyses('world-a'));
    expect(stored[0]).toMatchObject({ id: result.id, evidenceStale: true });
  });
  it('discards results if a reroll occurs during extraction', async () => {
    const options = await setup();
    options.analyst.extract = async () => {
      const bundle = bundleFixture(); bundle.records[0].summary = 'Rerolled';
      await options.repository.run('world-a', 'service:ingest', store => store.addBundle(bundle));
      return resultFixture();
    };
    await expect(analyzeStoredResearch(options)).rejects.toThrow('semantic_source_changed');
    expect(await options.repository.run('world-a', 'owner:alice', store => store.listSemanticAnalyses('world-a'))).toEqual([]);
  });
  it('rejects a changed canon projection, unbound context and disabled analysis', async () => {
    const options = await setup(); let calls = 0;
    options.context.resolve = async () => { const input = inputFixture(); if (calls++) input.canonProjection.revision = 'rev-2'; return input; };
    await expect(analyzeStoredResearch(options)).rejects.toThrow('semantic_source_changed');
    options.context.resolve = async () => { const input = inputFixture(); input.records[0].record.summary = 'Not stored'; return input; };
    await expect(analyzeStoredResearch(options)).rejects.toThrow('semantic_context_unbound');
    await options.repository.run('world-a', 'owner:alice', store => store.setWorldConfig({ ...store.getWorldConfig('world-a'), enabled: false }));
    await expect(analyzeStoredResearch(options)).rejects.toThrow('semantic_analysis_disabled');
  });
  it('stores nothing after invalid model output', async () => {
    const options = await setup(); options.analyst = new MockSemanticAnalyst('test-v1', { claims: 'invalid' });
    await expect(analyzeStoredResearch(options)).rejects.toThrow('invalid_semantic_output');
    expect(await options.repository.run('world-a', 'owner:alice', store => store.listSemanticAnalyses('world-a'))).toEqual([]);
  });
  it('protects both endpoints, fails closed when unconfigured, and refuses request credentials', async () => {
    const options = await setup();
    const authenticateOwner = async (token: string) => token === 'alice' ? { subject: 'alice', worldIds: ['world-a'] } : null;
    await request(createApp({ authenticateOwner })).post('/api/v1/worlds/world-a/semantic-analysis').set('Authorization','Bearer alice').send({}).expect(503);
    const app = createApp({ repository: options.repository, authenticateOwner, semantic: options });
    await request(app).post('/api/v1/worlds/world-a/semantic-analysis').send({}).expect(401);
    await request(app).get('/api/v1/worlds/world-b/semantic-analyses').set('Authorization','Bearer alice').expect(403);
    await request(app).post('/api/v1/worlds/world-a/semantic-analysis').set('Authorization','Bearer alice').send({ apiKey: 'never-forward-this' }).expect(400);
    const response = await request(app).post('/api/v1/worlds/world-a/semantic-analysis').set('Authorization','Bearer alice').send({}).expect(201);
    expect(response.body.canonChanged).toBe(false);
    const list = await request(app).get('/api/v1/worlds/world-a/semantic-analyses').set('Authorization','Bearer alice').expect(200);
    expect(list.body.analyses).toHaveLength(1);
  });
});
