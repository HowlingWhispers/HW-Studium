import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ResearchBundle } from './contracts.js';
import type { ResearchRepository } from './repository.js';
import {
  canonicalJson, canonProjectionSchema, runSemanticAnalysis, semanticAnalysisResultSchema,
  semanticInputFingerprint, validateSemanticInput, type SemanticAnalyst,
} from './semantic-analyst.js';

export const storedSemanticAnalysisSchema = z.object({
  id: z.string().uuid(),
  worldId: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceStale: z.boolean(),
  ordinal: z.number().int().positive().optional(),
  result: semanticAnalysisResultSchema,
  canonProjection: canonProjectionSchema.optional(),
  sourceBindings: z.array(z.object({ bundleId: z.string(), recordId: z.string(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).max(100).optional(),
}).strict().refine(value => value.worldId === value.result.worldId);
export function researchFingerprint(bundle: ResearchBundle, record: ResearchBundle['records'][number]): string {
  return createHash('sha256').update(canonicalJson({ worldId: bundle.worldId, source: bundle.source, record })).digest('hex');
}
export type StoredSemanticAnalysis = z.infer<typeof storedSemanticAnalysisSchema>;

// Server-owned adapter: selects committed records and their scopes, obtains a
// bounded Orbis projection, and verifies deterministic signals. Never accept this
// object, provider URL or credentials from an HTTP client or the analyst itself.
export interface SemanticContextResolver {
  resolve(worldId: string, bundles: readonly ResearchBundle[]): Promise<unknown>;
}
export class SemanticServiceError extends Error {
  constructor(readonly code: 'semantic_source_changed' | 'semantic_context_unbound' | 'semantic_analysis_disabled') { super(code); }
}
export async function analyzeStoredResearch(options: {
  repository: ResearchRepository;
  analyst: SemanticAnalyst;
  context: SemanticContextResolver;
  worldId: string;
  actor: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<StoredSemanticAnalysis> {
  const { repository, analyst, context, worldId, actor } = options;
  const snapshot = await repository.run(worldId, actor, store => structuredClone({ bundles: store.listBundlesForWorld(worldId), config: store.getWorldConfig(worldId) }));
  if (!snapshot.config.enabled) throw new SemanticServiceError('semantic_analysis_disabled');
  const input = validateSemanticInput(await context.resolve(worldId, structuredClone(snapshot.bundles)));
  if (input.worldId !== worldId) throw new SemanticServiceError('semantic_context_unbound');
  for (const source of input.records) {
    const bundle = snapshot.bundles.find(bundle => bundle.bundleId === source.bundleId);
    const record = bundle?.records.find(record => record.recordId === source.record.recordId);
    if (!bundle || !record || bundle.source !== source.source || bundle.capturedAt !== source.capturedAt || canonicalJson(record) !== canonicalJson(source.record)) throw new SemanticServiceError('semantic_context_unbound');
  }
  const analysis = await runSemanticAnalysis(analyst, input, { signal: options.signal, timeoutMs: options.timeoutMs });
  // Detect projection or trusted-source revisions while extraction was running.
  // Orbis is a separate service: the projection revision remains explicit, not a
  // claim of an atomic distributed snapshot across Orbis and Studium.
  const refreshed = validateSemanticInput(await context.resolve(worldId, structuredClone(snapshot.bundles)));
  if (semanticInputFingerprint(refreshed) !== analysis.inputFingerprint) throw new SemanticServiceError('semantic_source_changed');
  return repository.run(worldId, actor, store => {
    const current = { bundles: store.listBundlesForWorld(worldId), config: store.getWorldConfig(worldId) };
    if (canonicalJson(current) !== canonicalJson(snapshot)) throw new SemanticServiceError('semantic_source_changed');
    return store.addSemanticAnalysis(storedSemanticAnalysisSchema.parse({
      id: randomUUID(), worldId, createdAt: new Date().toISOString(),
      inputFingerprint: analysis.inputFingerprint, evidenceStale: false, result: analysis.result,
      canonProjection: input.canonProjection,
      sourceBindings: input.records.map(source => {
        const bundle = snapshot.bundles.find(bundle => bundle.bundleId === source.bundleId)!;
        return { bundleId: source.bundleId, recordId: source.record.recordId, fingerprint: researchFingerprint(bundle, source.record) };
      }),
    }));
  });
}
