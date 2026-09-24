import { createHash } from 'node:crypto';
import type { ClaimEntityRef, ClaimValue, ResearchBundle, StudiumProposal, WorldConfig } from './contracts.js';
import { canonicalJson, type ExplainedClaim } from './semantic-analyst.js';
import { researchFingerprint, type StoredSemanticAnalysis } from './semantic-service.js';

const thresholds = { conservative: 5, balanced: 3, exploratory: 2 } as const;
const key = (bundleId: string, recordId: string) => canonicalJson([bundleId, recordId]);
const identity = (ref: ClaimEntityRef) => ref.canonicalId ? { canonicalId: ref.canonicalId } : { candidateKey: ref.candidateKey };
const valueIdentity = (value?: ClaimValue) => value?.kind === 'entity' ? { kind: 'entity', ref: identity(value.ref) } : value;
const label = (ref: ClaimEntityRef) => ref.label ?? ref.canonicalId ?? ref.candidateKey!;
function normalized(item: ExplainedClaim) {
  let subject = item.claim.subject, object = item.claim.object;
  const direction = item.claim.classification === 'relationship_development' ? item.relationshipDirection ?? 'directed' : undefined;
  if (direction === 'symmetric' && object?.kind === 'entity' && canonicalJson(identity(subject)) > canonicalJson(identity(object.ref))) {
    const previous = subject; subject = object.ref; object = { kind: 'entity', ref: previous };
  }
  const holderRefs = [...new Map(item.claim.holderRefs.map(ref => [canonicalJson(identity(ref)), ref])).values()].sort((a,b) => canonicalJson(identity(a)).localeCompare(canonicalJson(identity(b))));
  const base = { classification: item.claim.classification, scope: item.scope, subject: identity(subject), predicate: item.claim.predicate, holders: holderRefs.map(identity), direction };
  return { subject, object, holderRefs, direction, base, cluster: canonicalJson({ ...base, object: valueIdentity(object) }) };
}

/** No AI calls. Only validated, current analysis evidence can contribute support. */
export function synthesizeSemanticProposals(worldId: string, bundles: ResearchBundle[], analyses: StoredSemanticAnalysis[], config: WorldConfig, previous: StudiumProposal[] = [], now = new Date()): StudiumProposal[] {
  const minimumEvidence = config.minEvidence ?? thresholds[config.mode];
  const records = new Map(bundles.filter(b => b.worldId === worldId).flatMap(b => b.records.map(r => [key(b.bundleId,r.recordId), { bundle: b, record: r, fingerprint: researchFingerprint(b,r) }] as const)));
  const ordered = analyses.filter(a => a.worldId === worldId && a.canonProjection && a.sourceBindings?.length)
    .sort((a,b) => (b.ordinal ?? 0) - (a.ordinal ?? 0) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const latest = ordered[0];
  const projection = latest?.canonProjection;
  // A newer empty extraction also supersedes older claims for its input records.
  const latestForRecord = new Map<string, string>();
  for (const analysis of ordered) for (const binding of analysis.sourceBindings!) {
    const k = key(binding.bundleId, binding.recordId);
    if (!latestForRecord.has(k)) latestForRecord.set(k, analysis.id);
  }
  const groups = new Map<string, Array<{ item: ExplainedClaim; analysis: StoredSemanticAnalysis }>>();
  if (config.enabled && projection) for (const analysis of ordered) {
    if (analysis.evidenceStale || analysis.result.canonRevision !== projection.revision) continue;
    if (analysis.sourceBindings!.some(b => records.get(key(b.bundleId,b.recordId))?.fingerprint !== b.fingerprint)) continue;
    for (const item of analysis.result.claims) {
      if (item.claim.classification === 'relationship_development' && item.claim.object?.kind !== 'entity') continue;
      if (item.claim.worldId !== worldId || item.claim.evidence.some(e => latestForRecord.get(key(e.bundleId,e.recordId)) !== analysis.id || !records.has(key(e.bundleId,e.recordId)))) continue;
      const cluster = normalized(item).cluster;
      const group = groups.get(cluster) ?? []; group.push({ item, analysis }); groups.set(cluster, group);
    }
  }
  const prior = new Map(previous.filter(p => p.semantic && p.worldId === worldId).map(p => [p.id,p]));
  const candidates = [...groups].map(([cluster, group]): StudiumProposal => {
    const first = group[0].item, claim = first.claim;
    const n = normalized(first);
    const id = `semantic_${createHash('sha256').update(canonicalJson([worldId,cluster])).digest('hex').slice(0,32)}`;
    const evidence = new Map<string, NonNullable<StudiumProposal['semantic']>['evidence'][number]>();
    for (const { item } of group) for (const e of item.claim.evidence) {
      const k = key(e.bundleId,e.recordId), source = records.get(k)!;
      const existing = evidence.get(k) ?? { bundleId: e.bundleId, recordId: e.recordId, source: source.bundle.source, fingerprint: source.fingerprint, authorities: [] };
      if (!existing.authorities.includes(e.authority)) existing.authorities.push(e.authority);
      existing.authorities.sort(); evidence.set(k, existing);
    }
    const support = [...evidence.values()].sort((a,b) => key(a.bundleId,a.recordId).localeCompare(key(b.bundleId,b.recordId)));
    const conflicts = [...new Set(group.flatMap(g => g.item.claim.conflictRefs))].sort();
    const kind = claim.classification === 'relationship_development' ? 'relationship' : claim.classification === 'conflict' ? 'inconsistency' : n.subject.entityType ?? projection!.entities.find(e => e.canonicalId === n.subject.canonicalId)?.entityType ?? 'lore';
    const relationship = claim.classification === 'relationship_development' && n.object?.kind === 'entity' ? { source: n.subject, predicate: claim.predicate, target: n.object.ref, direction: n.direction! } : undefined;
    const assertion = { classification: claim.classification, scope: first.scope, subject: n.subject, predicate: claim.predicate, object: n.object, holderRefs: n.holderRefs, relationship };
    const title = `${label(n.subject)}: ${claim.predicate}`;
    const summary = `${claim.classification}: ${label(n.subject)} ${claim.predicate} ${n.object?.kind === 'entity' ? label(n.object.ref) : n.object ? String(n.object.value) : '(unspecified)'}. ${first.explanation}`;
    const recordIds = [...new Set(support.map(e => e.recordId))];
    return { id, worldId, signalKey: id, kind, title, rationale: `Supported by ${support.length} distinct source records. ${first.explanation}`, evidenceRecordIds: recordIds, evidenceCount: support.length,
      evidenceStrength: support.length >= minimumEvidence * 2 ? 'strong' : support.length > minimumEvidence ? 'repeated' : 'emerging',
      evidenceStale: support.length < minimumEvidence, status: 'ready_for_review', createdAt: now.toISOString(), updatedAt: now.toISOString(),
      semantic: { schemaVersion: 'studium.proposal-semantics.v1', ...assertion, canonRevision: projection!.revision,
        canonicalFacts: projection!.facts.filter(f => f.subject.canonicalId === n.subject.canonicalId && !!n.subject.canonicalId && f.predicate === claim.predicate),
        conflictRefs: conflicts, competingProposalIds: [], minimumEvidence, evidence: support,
        claimRefs: group.map(g => ({ analysisId: g.analysis.id, claimId: g.item.claim.claimId, extractionVersion: g.analysis.result.extractionVersion, explanation: g.item.explanation })).sort((a,b) => canonicalJson(a).localeCompare(canonicalJson(b))),
      },
      orbisDraft: { recordType: kind, name: title, summary, source: 'studium-proposal', evidenceRecordIds: recordIds, assertion },
    };
  });
  // Alternatives are review links, not automatic claims of contradiction: some
  // predicates are multi-valued. Never link different beliefs or scopes together.
  for (const proposal of candidates) {
    const a = proposal.semantic!;
    proposal.semantic!.competingProposalIds = candidates.filter(other => {
      const b = other.semantic!;
      return other.id !== proposal.id && canonicalJson([a.classification,a.scope,identity(a.subject),a.predicate,a.holderRefs.map(identity),a.relationship?.direction]) === canonicalJson([b.classification,b.scope,identity(b.subject),b.predicate,b.holderRefs.map(identity),b.relationship?.direction]);
    }).map(p => p.id).sort();
  }
  const visible = candidates.filter(p => p.evidenceCount >= minimumEvidence || prior.has(p.id));
  const visibleIds = new Set(visible.map(p => p.id));
  for (const old of prior.values()) if (!visibleIds.has(old.id)) {
    visible.push({ ...old, evidenceCount: 0, evidenceRecordIds: [], evidenceStale: true, evidenceStrength: 'emerging', updatedAt: now.toISOString(),
      rationale: 'No current eligible evidence supports this historical candidate. Reanalysis and review are required.',
      semantic: { ...old.semantic!, evidence: [], claimRefs: [], competingProposalIds: [], minimumEvidence },
      orbisDraft: { ...old.orbisDraft, evidenceRecordIds: [] },
    });
  }
  const storedIds = new Set(visible.map(p => p.id));
  for (const proposal of visible) proposal.semantic!.competingProposalIds = proposal.semantic!.competingProposalIds.filter(id => storedIds.has(id));
  return visible.sort((a,b) => b.evidenceCount-a.evidenceCount || a.id.localeCompare(b.id));
}
