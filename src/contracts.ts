import { z } from 'zod';

export const sourceSystemSchema = z.enum(['speculus', 'fabula']);
export type SourceSystem = z.infer<typeof sourceSystemSchema>;

export const analysisModeSchema = z.enum(['conservative', 'balanced', 'exploratory']);
export type AnalysisMode = z.infer<typeof analysisModeSchema>;

export const entityTypeSchema = z.enum([
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
