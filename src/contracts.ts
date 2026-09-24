import { z } from 'zod';

export const sourceSystemSchema = z.enum(['speculus', 'fabula']);
export type SourceSystem = z.infer<typeof sourceSystemSchema>;

export const analysisModeSchema = z.enum(['conservative', 'balanced', 'exploratory']);
export type AnalysisMode = z.infer<typeof analysisModeSchema>;

export const coreEntityTypeSchema = z.enum([
  'character',
  'place',
  'family',
  'faction',
  'item',
  'species',
  'society',
  'event',
  'relationship',
  'lore',
]);

export const extensionEntityTypeSchema = z
  .string()
  .regex(/^custom:[a-z0-9][a-z0-9._-]{0,63}$/);

export const entityTypeSchema = z.union([coreEntityTypeSchema, extensionEntityTypeSchema]);
export type EntityType = z.infer<typeof entityTypeSchema>;

export const signalTypeSchema = z.enum([
  'entity_candidate',
  'relationship_candidate',
  'canon_conflict',
  'emergent_lore',
]);

export type SignalType = z.infer<typeof signalTypeSchema>;

export const researchSignalSchema = z.object({
  type: signalTypeSchema,
  key: z.string().min(1).max(240),
  label: z.string().min(1).max(240),
  entityType: entityTypeSchema.optional(),
  canonicalRefs: z.array(z.string().min(1)).default([]),
  details: z.string().max(4000).optional(),
});

export type ResearchSignal = z.infer<typeof researchSignalSchema>;

export const researchRecordSchema = z.object({
  recordId: z.string().min(1).max(200),
  occurredAt: z.string().min(1),
  kind: z.string().min(1).max(100),
  summary: z.string().min(1).max(4000),
  evidence: z.array(z.string().max(1000)).max(20).default([]),
  signals: z.array(researchSignalSchema).max(100).default([]),
  tags: z.array(z.string().min(1).max(100)).max(100).default([]),
});

export type ResearchRecord = z.infer<typeof researchRecordSchema>;

export const researchBundleSchema = z.object({
  schemaVersion: z.literal('studium.bundle.v1'),
  bundleId: z.string().min(1).max(200),
  worldId: z.string().min(1).max(200),
  source: sourceSystemSchema,
  capturedAt: z.string().min(1),
  sanitized: z.literal(true),
  records: z.array(researchRecordSchema).min(1).max(5000),
});

export type ResearchBundle = z.infer<typeof researchBundleSchema>;

export const worldConfigSchema = z.object({
  worldId: z.string().min(1).max(200),
  mode: analysisModeSchema.default('balanced'),
  reviewCadence: z.enum(['weekly', 'manual']).default('weekly'),
  minEvidence: z.number().int().min(2).max(50).optional(),
  enabled: z.boolean().default(true),
  retention: z.object({
    reviewAfterDays: z.number().int().min(1).max(36500).nullable().default(null),
    legalHold: z.boolean().default(false),
  }).optional(),
});

export type WorldConfig = z.infer<typeof worldConfigSchema>;

export const proposalKindSchema = z.enum([
  'character',
  'place',
  'family',
  'faction',
  'item',
  'species',
  'society',
  'event',
  'relationship',
  'lore',
  'inconsistency',
]);

export type ProposalKind = z.infer<typeof proposalKindSchema>;

export const proposalStatusSchema = z.enum([
  'draft',
  'ready_for_review',
  'accepted',
  'rejected',
  'deferred',
]);

export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export type EvidenceStrength = 'emerging' | 'repeated' | 'strong';

export interface StudiumProposal {
  evidenceStale?: boolean;
  id: string;
  worldId: string;
  signalKey: string;
  kind: ProposalKind;
  title: string;
  rationale: string;
  evidenceRecordIds: string[];
  evidenceCount: number;
  evidenceStrength: EvidenceStrength;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
  orbisDraft: {
    recordType: ProposalKind;
    name: string;
    summary: string;
    source: 'studium-proposal';
    evidenceRecordIds: string[];
  };
}

export interface WeeklyWorldReport {
  id?: string;
  worldId: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  bundleCount: number;
  recordCount: number;
  sourceCounts: Record<SourceSystem, number>;
  proposalCount: number;
  proposalKinds: Partial<Record<ProposalKind, number>>;
  highlights: Array<{
    proposalId: string;
    kind: ProposalKind;
    title: string;
    evidenceCount: number;
    evidenceStrength: EvidenceStrength;
  }>;
  note: string;
}

export const sourceAuthoritySchema = z.enum([
  'orbis_canon',
  'runtime_state',
  'structured_signal',
  'narrative_text',
  'model_inference',
]);

export type SourceAuthority = z.infer<typeof sourceAuthoritySchema>;

export const epistemicClassificationSchema = z.enum([
  'world_fact_candidate',
  'runtime_fact',
  'character_belief',
  'faction_belief',
  'rumor',
  'observation',
  'relationship_development',
  'event',
  'state_change',
  'inference',
  'conflict',
  'unknown',
]);

export type EpistemicClassification = z.infer<typeof epistemicClassificationSchema>;

export const claimEntityRefSchema = z
  .object({
    canonicalId: z.string().min(1).max(200).optional(),
    candidateKey: z.string().min(1).max(240).optional(),
    label: z.string().min(1).max(240).optional(),
    entityType: entityTypeSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.canonicalId || value.candidateKey), {
    message: 'A claim entity reference requires canonicalId or candidateKey.',
  });

export type ClaimEntityRef = z.infer<typeof claimEntityRefSchema>;

export const claimValueSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    value: z.string().max(4000),
  }).strict(),
  z.object({
    kind: z.literal('number'),
    value: z.number().finite(),
  }).strict(),
  z.object({
    kind: z.literal('boolean'),
    value: z.boolean(),
  }).strict(),
  z.object({
    kind: z.literal('entity'),
    ref: claimEntityRefSchema,
  }).strict(),
]);

export type ClaimValue = z.infer<typeof claimValueSchema>;

export const claimEvidenceRefSchema = z
  .object({
    bundleId: z.string().min(1).max(200),
    recordId: z.string().min(1).max(200),
    source: sourceSystemSchema,
    authority: sourceAuthoritySchema,
    capturedAt: z.string().min(1).optional(),
    occurredAt: z.string().min(1).optional(),
    runtimeEventId: z.string().min(1).max(200).optional(),
    canonicalRevisionIds: z.array(z.string().min(1).max(200)).max(100).default([]),
  })
  .strict();

export type ClaimEvidenceRef = z.infer<typeof claimEvidenceRefSchema>;

export const semanticClaimSchema = z
  .object({
    schemaVersion: z.literal('studium.claim.v1'),
    claimId: z.string().min(1).max(200),
    worldId: z.string().min(1).max(200),
    classification: epistemicClassificationSchema,
    subject: claimEntityRefSchema,
    predicate: z.string().min(1).max(240),
    object: claimValueSchema.optional(),
    holderRefs: z.array(claimEntityRefSchema).max(50).default([]),
    confidence: z.number().min(0).max(1),
    evidence: z.array(claimEvidenceRefSchema).min(1).max(100),
    canonicalRefs: z.array(z.string().min(1).max(200)).max(100).default([]),
    conflictRefs: z.array(z.string().min(1).max(200)).max(100).default([]),
    extractionVersion: z.string().min(1).max(100),
    tags: z.array(z.string().min(1).max(100)).max(100).default([]),
  })
  .strict()
  .superRefine((claim, ctx) => {
    if (
      (claim.classification === 'character_belief' || claim.classification === 'faction_belief') &&
      claim.holderRefs.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['holderRefs'],
        message: 'Belief claims require at least one holder reference.',
      });
    }

    if (claim.classification === 'conflict' && claim.conflictRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['conflictRefs'],
        message: 'Conflict claims require at least one conflict reference.',
      });
    }
  });

export type SemanticClaim = z.infer<typeof semanticClaimSchema>;
