import { describe, expect, it } from 'vitest';
import {
  entityTypeSchema,
  researchBundleSchema,
  semanticClaimSchema,
} from '../src/contracts.js';
import {
  compareSourceAuthority,
  isAtLeastAsAuthoritative,
  strongestSourceAuthority,
} from '../src/semantic.js';

function evidence(authority: 'orbis_canon' | 'runtime_state' | 'structured_signal' | 'narrative_text' | 'model_inference') {
  return {
    bundleId: 'bundle-1',
    recordId: 'record-1',
    source: 'speculus' as const,
    authority,
    occurredAt: '2026-09-24T00:00:00.000Z',
    canonicalRevisionIds: [],
  };
}

describe('living canon semantic contracts', () => {
  it('keeps existing studium.bundle.v1 input valid', () => {
    const parsed = researchBundleSchema.safeParse({
      schemaVersion: 'studium.bundle.v1',
      bundleId: 'speculus:session-1:turn-1',
      worldId: 'world-1',
      source: 'speculus',
      capturedAt: '2026-09-24T00:00:01.000Z',
      sanitized: true,
      records: [
        {
          recordId: 'speculus:v3:session-1:turn-1',
          occurredAt: '2026-09-24T00:00:00.000Z',
          kind: 'speculus_v3_turn',
          summary: 'A committed turn.',
          evidence: [],
          signals: [],
          tags: [],
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it('accepts namespaced extension entity kinds and rejects unnamespaced custom kinds', () => {
    expect(entityTypeSchema.safeParse('custom:starship_class').success).toBe(true);
    expect(entityTypeSchema.safeParse('starship_class').success).toBe(false);
  });

  it('requires a holder for character beliefs', () => {
    const parsed = semanticClaimSchema.safeParse({
      schemaVersion: 'studium.claim.v1',
      claimId: 'claim-1',
      worldId: 'world-1',
      classification: 'character_belief',
      subject: {
        canonicalId: 'entity-beastfolk',
        entityType: 'species',
      },
      predicate: 'exists',
      object: {
        kind: 'boolean',
        value: false,
      },
      holderRefs: [],
      confidence: 0.9,
      evidence: [evidence('narrative_text')],
      canonicalRefs: ['entity-beastfolk'],
      conflictRefs: [],
      extractionVersion: 'semantic-contract-test-v1',
      tags: [],
    });

    expect(parsed.success).toBe(false);
  });

  it('represents a character belief without promoting it to world truth', () => {
    const parsed = semanticClaimSchema.safeParse({
      schemaVersion: 'studium.claim.v1',
      claimId: 'claim-2',
      worldId: 'world-1',
      classification: 'character_belief',
      subject: {
        canonicalId: 'entity-beastfolk',
        entityType: 'species',
      },
      predicate: 'exists',
      object: {
        kind: 'boolean',
        value: false,
      },
      holderRefs: [
        {
          canonicalId: 'character-ragna',
          entityType: 'character',
        },
      ],
      confidence: 0.9,
      evidence: [evidence('narrative_text')],
      canonicalRefs: ['entity-beastfolk', 'character-ragna'],
      conflictRefs: [],
      extractionVersion: 'semantic-contract-test-v1',
      tags: [],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.classification).toBe('character_belief');
    expect(parsed.data.holderRefs[0].canonicalId).toBe('character-ragna');
  });

  it('requires conflict claims to identify what they conflict with', () => {
    const parsed = semanticClaimSchema.safeParse({
      schemaVersion: 'studium.claim.v1',
      claimId: 'claim-3',
      worldId: 'world-1',
      classification: 'conflict',
      subject: {
        candidateKey: 'place:crossing',
        entityType: 'place',
      },
      predicate: 'name',
      object: {
        kind: 'text',
        value: 'The Crossing',
      },
      holderRefs: [],
      confidence: 0.8,
      evidence: [evidence('model_inference')],
      canonicalRefs: [],
      conflictRefs: [],
      extractionVersion: 'semantic-contract-test-v1',
      tags: [],
    });

    expect(parsed.success).toBe(false);
  });

  it('orders source authority from canon down to model inference', () => {
    expect(compareSourceAuthority('orbis_canon', 'runtime_state')).toBeGreaterThan(0);
    expect(compareSourceAuthority('runtime_state', 'structured_signal')).toBeGreaterThan(0);
    expect(compareSourceAuthority('structured_signal', 'narrative_text')).toBeGreaterThan(0);
    expect(compareSourceAuthority('narrative_text', 'model_inference')).toBeGreaterThan(0);
    expect(isAtLeastAsAuthoritative('runtime_state', 'narrative_text')).toBe(true);
    expect(isAtLeastAsAuthoritative('model_inference', 'structured_signal')).toBe(false);
    expect(
      strongestSourceAuthority(['model_inference', 'structured_signal', 'runtime_state']),
    ).toBe('runtime_state');
  });
});
