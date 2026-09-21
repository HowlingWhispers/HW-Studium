import express from 'express';
import { z } from 'zod';
import { analyzeWorld } from './analyzer.js';
import {
  proposalStatusSchema,
  researchBundleSchema,
  worldConfigSchema,
} from './contracts.js';
import { createWeeklyWorldReport } from './report.js';
import { StudiumStore } from './store.js';

export function createApp(store = new StudiumStore()) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'studium',
      version: '0.1.0',
      canonWriteAccess: false,
    });
  });

  app.post('/api/v1/bundles', (req, res) => {
    const parsed = researchBundleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_research_bundle',
        details: parsed.error.flatten(),
      });
    }

    const result = store.addBundle(parsed.data);
    return res.status(result.inserted ? 201 : 200).json({
      ok: true,
      inserted: result.inserted,
      bundleId: parsed.data.bundleId,
    });
  });

  app.put('/api/v1/worlds/:worldId/config', (req, res) => {
    const parsed = worldConfigSchema.safeParse({
      ...req.body,
      worldId: req.params.worldId,
    });

    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_world_config',
        details: parsed.error.flatten(),
      });
    }

    return res.json({ ok: true, config: store.setWorldConfig(parsed.data) });
  });

  app.post('/api/v1/worlds/:worldId/analyze', (req, res) => {
    const worldId = req.params.worldId;
    const bundles = store.listBundlesForWorld(worldId);
    const records = bundles.flatMap((bundle) => bundle.records);
    const config = store.getWorldConfig(worldId);
    const proposals = store.upsertProposals(analyzeWorld(worldId, records, config));

    return res.json({
      ok: true,
      worldId,
      config,
      bundleCount: bundles.length,
      recordCount: records.length,
      proposals,
    });
  });

  app.get('/api/v1/worlds/:worldId/proposals', (req, res) => {
    return res.json({
      ok: true,
      worldId: req.params.worldId,
      proposals: store.listProposals(req.params.worldId),
    });
  });

  app.patch('/api/v1/proposals/:proposalId/status', (req, res) => {
    const parsed = z.object({ status: proposalStatusSchema }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_proposal_status',
        details: parsed.error.flatten(),
      });
    }

    const proposal = store.updateProposalStatus(req.params.proposalId, parsed.data.status);
    if (!proposal) {
      return res.status(404).json({ ok: false, error: 'proposal_not_found' });
    }

    return res.json({
      ok: true,
      proposal,
      canonChanged: false,
      note: 'Changing a Studium proposal status does not write to Orbis.',
    });
  });

  app.post('/api/v1/worlds/:worldId/weekly-report', (req, res) => {
    const worldId = req.params.worldId;
    const bundles = store.listBundlesForWorld(worldId);
    const records = bundles.flatMap((bundle) => bundle.records);
    const config = store.getWorldConfig(worldId);
    const proposals = store.upsertProposals(analyzeWorld(worldId, records, config));
    const report = store.addReport(createWeeklyWorldReport(worldId, bundles, proposals));

    return res.status(201).json({ ok: true, report });
  });

  app.get('/api/v1/worlds/:worldId/reports/latest', (req, res) => {
    const report = store.latestReport(req.params.worldId);
    if (!report) {
      return res.status(404).json({ ok: false, error: 'report_not_found' });
    }

    return res.json({ ok: true, report });
  });

  return app;
}
