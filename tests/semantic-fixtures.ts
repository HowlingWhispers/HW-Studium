import type { ExplainedClaim, SemanticAnalysisInput, SemanticAnalysisResult } from '../src/semantic-analyst.js';
import type { ResearchBundle } from '../src/contracts.js';
export function inputFixture(): SemanticAnalysisInput {
  return {
    schemaVersion: 'studium.semantic-input.v1', worldId: 'world-a', extractionVersion: 'test-v1',
    records: [{ bundleId: 'bundle-a', source: 'speculus', capturedAt: '2026-09-24T01:00:00Z', sanitized: true, committed: true,
      scope: { kind: 'session', sessionId: 'save-a', at: 'turn-1' },
      record: { recordId: 'turn-1', occurredAt: '2026-09-24T00:59:00Z', kind: 'speculus_v3_turn', summary: 'Mira believes the station is abandoned. A rumor says it is haunted. She sees a light.', evidence: [], signals: [], tags: [] } }],
    canonProjection: { schemaVersion: 'studium.canon-projection.v1', worldId: 'world-a', revision: 'rev-1',
      entities: [
        { canonicalId: 'mira', entityType: 'character', name: 'Mira', aliases: [], summary: '' },
        { canonicalId: 'station', entityType: 'place', name: 'Station', aliases: ['The Beacon'], summary: '' },
      ], facts: [{ factId: 'canon-occupied', subject: { canonicalId: 'station' }, predicate: 'occupied', object: { kind: 'boolean', value: true }, scope: { kind: 'world' } }], rules: [] },
    structuredClaims: [],
  };
}
export function claimFixture(classification: ExplainedClaim['claim']['classification'] = 'world_fact_candidate'): ExplainedClaim {
  return { scope: { kind: 'world' }, explanation: 'The cited turn contains this statement.', claim: {
    schemaVersion: 'studium.claim.v1', claimId: 'claim-1', worldId: 'world-a', classification,
    subject: { canonicalId: 'station' }, predicate: 'occupied', object: { kind: 'boolean', value: false },
    holderRefs: classification === 'character_belief' ? [{ canonicalId: 'mira' }] : [], confidence: 0.8,
    evidence: [{ bundleId: 'bundle-a', recordId: 'turn-1', source: 'speculus', authority: 'narrative_text', canonicalRevisionIds: ['rev-1'] }],
    canonicalRefs: ['station'], conflictRefs: [], extractionVersion: 'test-v1', tags: [],
  } };
}
export function resultFixture(claims: ExplainedClaim[] = []): SemanticAnalysisResult {
  return { schemaVersion: 'studium.semantic-result.v1', worldId: 'world-a', extractionVersion: 'test-v1', canonRevision: 'rev-1', claims, aliasCandidates: [] };
}
export function bundleFixture(): ResearchBundle {
  const source = inputFixture().records[0];
  return { schemaVersion: 'studium.bundle.v1', bundleId: source.bundleId, worldId: 'world-a', source: source.source, capturedAt: source.capturedAt, sanitized: true, records: [source.record] };
}
