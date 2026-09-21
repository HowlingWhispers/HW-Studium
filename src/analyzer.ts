import { createHash } from 'node:crypto';
import type {
  ProposalKind,
  ResearchRecord,
  ResearchSignal,
  StudiumProposal,
  WorldConfig,
} from './contracts.js';

const modeThresholds = {
  conservative: 5,
  balanced: 3,
  exploratory: 2,
} as const;

function proposalKindFor(signal: ResearchSignal): ProposalKind {
  if (signal.type === 'canon_conflict') return 'inconsistency';
  if (signal.type === 'relationship_candidate') return 'relationship';
  if (signal.type === 'emergent_lore') return 'lore';

  switch (signal.entityType) {
    case 'character':
    case 'place':
    case 'family':
    case 'faction':
    case 'item':
    case 'species':
    case 'society':
    case 'event':
    case 'relationship':
    case 'lore':
      return signal.entityType;
    default:
      return 'lore';
  }
}

function strength(count: number, threshold: number): StudiumProposal['evidenceStrength'] {
  if (count >= threshold * 2) return 'strong';
  if (count >= threshold + 1) return 'repeated';
  return 'emerging';
}

function proposalId(worldId: string, signalKey: string): string {
  const digest = createHash('sha256').update(`${worldId}\0${signalKey}`).digest('hex').slice(0, 20);
  return `proposal_${digest}`;
}

export function analyzeWorld(
  worldId: string,
  records: ResearchRecord[],
  config: WorldConfig,
  now = new Date(),
): StudiumProposal[] {
  if (!config.enabled) return [];

  const threshold = config.minEvidence ?? modeThresholds[config.mode];
  const grouped = new Map<string, Array<{ signal: ResearchSignal; record: ResearchRecord }>>();

  for (const record of records) {
    for (const signal of record.signals) {
      const key = `${signal.type}:${signal.key.toLowerCase().trim()}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push({ signal, record });
      grouped.set(key, bucket);
    }
  }

  const nowIso = now.toISOString();
  const proposals: StudiumProposal[] = [];

  for (const [, evidence] of grouped) {
    const uniqueRecords = new Map(evidence.map((item) => [item.record.recordId, item]));
    if (uniqueRecords.size < threshold) continue;

    const first = evidence[0].signal;
    const kind = proposalKindFor(first);
    const recordIds = [...uniqueRecords.keys()];
    const details = evidence
      .map((item) => item.signal.details)
      .find((value): value is string => Boolean(value?.trim()));

    proposals.push({
      id: proposalId(worldId, first.key),
      worldId,
      signalKey: first.key,
      kind,
      title: first.label,
      rationale:
        details ??
        `Studium observed this ${uniqueRecords.size} times in sanitized Speculus/Fabula research records.`,
      evidenceRecordIds: recordIds,
      evidenceCount: uniqueRecords.size,
      evidenceStrength: strength(uniqueRecords.size, threshold),
      status: 'ready_for_review',
      createdAt: nowIso,
      updatedAt: nowIso,
      orbisDraft: {
        recordType: kind,
        name: first.label,
        summary:
          details ??
          `Prepared by Studium from ${uniqueRecords.size} recurring observations. Review before adding to Orbis canon.`,
        source: 'studium-proposal',
        evidenceRecordIds: recordIds,
      },
    });
  }

  return proposals.sort((a, b) => {
    if (b.evidenceCount !== a.evidenceCount) return b.evidenceCount - a.evidenceCount;
    return a.title.localeCompare(b.title);
  });
}
