import type { ClaimEntityRef, ClaimValue, EpistemicClassification, SourceAuthority } from './contracts.js';
import type { CanonProjection, SemanticAnalysisInput } from './semantic-analyst.js';

export interface SemanticProposalMetadata {
  schemaVersion: 'studium.proposal-semantics.v1';
  classification: EpistemicClassification;
  scope: SemanticAnalysisInput['records'][number]['scope'];
  subject: ClaimEntityRef;
  predicate: string;
  object?: ClaimValue;
  holderRefs: ClaimEntityRef[];
  canonRevision: string;
  canonicalFacts: CanonProjection['facts'];
  conflictRefs: string[];
  competingProposalIds: string[];
  minimumEvidence: number;
  claimRefs: Array<{ analysisId: string; claimId: string; extractionVersion: string; explanation: string }>;
  evidence: Array<{ bundleId: string; recordId: string; source: 'speculus' | 'fabula'; fingerprint: string; authorities: SourceAuthority[] }>;
  relationship?: { source: ClaimEntityRef; predicate: string; target: ClaimEntityRef; direction: 'directed' | 'symmetric' };
}
