import { SemanticAnalysisError, type SemanticAnalyst } from './semantic-analyst.js';
import { analyzeStoredResearch, SemanticServiceError, type SemanticContextResolver } from './semantic-service.js';
import { timingSafeEqual } from 'node:crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { analyzeWorld } from './analyzer.js';
import { proposalStatusSchema, researchBundleSchema, worldConfigSchema } from './contracts.js';
import { createWeeklyWorldReport } from './report.js';
import { MemoryResearchRepository, type ResearchRepository } from './repository.js';

export interface OwnerPrincipal { subject: string; worldIds: readonly string[] }
export type AuthenticateOwner = (token: string) => Promise<OwnerPrincipal | null>;
export function secretMatches(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  return b.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
function bearer(req: Request) { return req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? ''; }

function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string') throw Object.assign(new Error('invalid_path_parameter'), { status: 400 });
  return value;
}

export function createApp(options: {
  repository?: ResearchRepository;
  ingestSecret?: string | null;
  authenticateOwner?: AuthenticateOwner;
  semantic?: { analyst: SemanticAnalyst; context: SemanticContextResolver; timeoutMs?: number };
} = {}) {
  const repository = options.repository ?? new MemoryResearchRepository();
  const ingestSecret = options.ingestSecret ?? process.env.STUDIUM_INGEST_SECRET ?? '';
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' }));
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'studium', version: '0.1.0', canonWriteAccess: false }));

  function service(req: Request, res: Response, next: NextFunction) {
    if (!ingestSecret) return res.status(503).json({ ok: false, error: 'studium_ingest_not_configured' });
    if (!secretMatches(bearer(req), ingestSecret)) return res.status(401).json({ ok: false, error: 'studium_ingest_unauthorized' });
    next();
  }
  async function owner(req: Request, res: Response, next: NextFunction) {
    if (!options.authenticateOwner) return res.status(503).json({ ok: false, error: 'owner_auth_not_configured' });
    const principal = await options.authenticateOwner(bearer(req));
    if (!principal) return res.status(401).json({ ok: false, error: 'owner_unauthorized' });
    res.locals.owner = principal;
    next();
  }
  function allowed(res: Response, worldId: string) {
    const principal = res.locals.owner as OwnerPrincipal;
    if (!principal.worldIds.includes(worldId)) {
      res.status(403).json({ ok: false, error: 'world_access_denied' });
      return false;
    }
    return true;
  }
  const actor = (res: Response) => `owner:${(res.locals.owner as OwnerPrincipal).subject}`;

  app.post('/api/v1/bundles', service, async (req, res) => {
    const parsed = researchBundleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'invalid_research_bundle', details: parsed.error.flatten() });
    const result = await repository.run(parsed.data.worldId, 'service:ingest', store => store.addBundle(parsed.data));
    return res.status(result.inserted ? 201 : 200).json({ ok: true, ...result, bundleId: parsed.data.bundleId });
  });
  app.delete('/api/v1/bundles/:bundleId', service, async (req, res) => {
    const worldId = await repository.findWorld('bundle', pathParam(req, 'bundleId'));
    const removed = worldId !== null && await repository.run(worldId, 'service:ingest', store => store.removeBundle(pathParam(req, 'bundleId')));
    return res.status(removed ? 200 : 404).json({ ok: removed, removed, bundleId: pathParam(req, 'bundleId'), ...(removed ? {} : { error: 'research_bundle_not_found' }) });
  });

  app.use('/api/v1/worlds/:worldId', owner, (req, res, next) => {
    if (allowed(res, pathParam(req, 'worldId'))) next();
  });
  app.post('/api/v1/worlds/:worldId/semantic-analysis', async (req, res) => {
    if (!z.object({}).strict().safeParse(req.body ?? {}).success) return res.status(400).json({ ok: false, error: 'semantic_request_must_be_empty' });
    if (!options.semantic) return res.status(503).json({ ok: false, error: 'semantic_analyst_not_configured' });
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', cancel);
    try {
      const analysis = await analyzeStoredResearch({ repository, ...options.semantic, worldId: pathParam(req, 'worldId'), actor: actor(res), signal: controller.signal });
      return res.status(201).json({ ok: true, analysis, canonChanged: false });
    } finally { res.removeListener('close', cancel); }
  });
  app.get('/api/v1/worlds/:worldId/semantic-analyses', async (req, res) => {
    const analyses = await repository.run(pathParam(req, 'worldId'), actor(res), store => store.listSemanticAnalyses(pathParam(req, 'worldId')));
    return res.json({ ok: true, analyses });
  });
  app.put('/api/v1/worlds/:worldId/config', async (req, res) => {
    const parsed = worldConfigSchema.safeParse({ ...req.body, worldId: pathParam(req, 'worldId') });
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'invalid_world_config', details: parsed.error.flatten() });
    const config = await repository.run(pathParam(req, 'worldId'), actor(res), store => store.setWorldConfig(parsed.data));
    return res.json({ ok: true, config });
  });
  app.post('/api/v1/worlds/:worldId/analyze', async (req, res) => {
    const worldId = pathParam(req, 'worldId');
    const result = await repository.run(worldId, actor(res), store => {
      const bundles = store.listBundlesForWorld(worldId);
      const records = bundles.flatMap(bundle => bundle.records);
      const config = store.getWorldConfig(worldId);
      const proposals = [...store.reconcileProposals(worldId, analyzeWorld(worldId, records, config)), ...store.synthesizeProposals(worldId).filter(p => !p.evidenceStale)];
      return { config, bundleCount: bundles.length, recordCount: records.length, proposals };
    });
    return res.json({ ok: true, worldId, ...result });
  });
  app.get('/api/v1/worlds/:worldId/proposals', async (req, res) => {
    const proposals = await repository.run(pathParam(req, 'worldId'), actor(res), store => store.listProposals(pathParam(req, 'worldId')));
    return res.json({ ok: true, worldId: pathParam(req, 'worldId'), proposals });
  });
  app.patch('/api/v1/proposals/:proposalId/status', owner, async (req, res) => {
    const worldId = await repository.findWorld('proposal', pathParam(req, 'proposalId'));
    if (!worldId) return res.status(404).json({ ok: false, error: 'proposal_not_found' });
    if (!allowed(res, worldId)) return;
    const parsed = z.object({ status: proposalStatusSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'invalid_proposal_status', details: parsed.error.flatten() });
    const proposal = await repository.run(worldId, actor(res), store => store.updateProposalStatus(pathParam(req, 'proposalId'), parsed.data.status));
    return res.json({ ok: true, proposal, canonChanged: false, note: 'Changing a Studium proposal status does not write to Orbis.' });
  });
  app.patch('/api/v1/proposals/:proposalId/draft', owner, async (req, res) => {
    const worldId = await repository.findWorld('proposal', pathParam(req, 'proposalId'));
    if (!worldId) return res.status(404).json({ ok: false, error: 'proposal_not_found' });
    if (!allowed(res, worldId)) return;
    const parsed = z.object({ name: z.string().min(1).max(500), summary: z.string().min(1).max(4000) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'invalid_proposal_draft' });
    const proposal = await repository.run(worldId, actor(res), store => store.editProposalDraft(pathParam(req, 'proposalId'), parsed.data));
    return res.json({ ok: true, proposal, canonChanged: false });
  });
  app.post('/api/v1/worlds/:worldId/synthesize', async (req, res) => {
    if (!z.object({}).strict().safeParse(req.body ?? {}).success) return res.status(400).json({ ok: false, error: 'synthesis_request_must_be_empty' });
    const proposals = await repository.run(pathParam(req, 'worldId'), actor(res), store => store.synthesizeProposals(pathParam(req, 'worldId')));
    return res.json({ ok: true, proposals, canonChanged: false });
  });
  app.post('/api/v1/worlds/:worldId/weekly-report', async (req, res) => {
    const worldId = pathParam(req, 'worldId');
    const report = await repository.run(worldId, actor(res), store => {
      const bundles = store.listBundlesForWorld(worldId);
      const config = store.getWorldConfig(worldId);
      const proposals = [...store.reconcileProposals(worldId, analyzeWorld(worldId, bundles.flatMap(bundle => bundle.records), config)), ...store.synthesizeProposals(worldId).filter(p => !p.evidenceStale)];
      return store.addReport(createWeeklyWorldReport(worldId, bundles, proposals));
    });
    return res.status(201).json({ ok: true, report });
  });
  app.get('/api/v1/worlds/:worldId/reports/latest', async (req, res) => {
    const report = await repository.run(pathParam(req, 'worldId'), actor(res), store => store.latestReport(pathParam(req, 'worldId')));
    if (!report) return res.status(404).json({ ok: false, error: 'report_not_found' });
    return res.json({ ok: true, report });
  });
  app.get('/api/v1/worlds/:worldId/history', async (req, res) => {
    const parsed = z.string().regex(/^\d{1,18}$/).safeParse(req.query.after ?? '0');
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'invalid_history_cursor' });
    const history = await repository.history(pathParam(req, 'worldId'), parsed.data);
    return res.json({ ok: true, history, nextCursor: history.at(-1)?.sequence ?? parsed.data });
  });
  app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof SemanticServiceError) return res.status(409).json({ ok: false, error: error.code });
    if (error instanceof SemanticAnalysisError) return res.status(error.code === 'semantic_timeout' ? 504 : 502).json({ ok: false, error: error.code });
    if (['document_world_conflict', 'proposal_evidence_stale'].includes(error.message)) return res.status(409).json({ ok: false, error: error.message });
    if (error.status === 400 || error.status === 413) return res.status(error.status).json({ ok: false, error: 'invalid_request_body' });
    return res.status(500).json({ ok: false, error: 'studium_operation_failed' });
  });
  return app;
}
