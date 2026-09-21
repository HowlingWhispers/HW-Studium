import type {
  ProposalKind,
  ResearchBundle,
  StudiumProposal,
  WeeklyWorldReport,
} from './contracts.js';

export function createWeeklyWorldReport(
  worldId: string,
  bundles: ResearchBundle[],
  proposals: StudiumProposal[],
  now = new Date(),
): WeeklyWorldReport {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 7);

  const inPeriod = bundles.filter((bundle) => {
    const captured = Date.parse(bundle.capturedAt);
    return Number.isFinite(captured) && captured >= start.getTime() && captured <= end.getTime();
  });

  const sourceCounts = {
    speculus: inPeriod.filter((bundle) => bundle.source === 'speculus').length,
    fabula: inPeriod.filter((bundle) => bundle.source === 'fabula').length,
  };

  const proposalKinds: Partial<Record<ProposalKind, number>> = {};
  for (const proposal of proposals) {
    proposalKinds[proposal.kind] = (proposalKinds[proposal.kind] ?? 0) + 1;
  }

  return {
    worldId,
    generatedAt: now.toISOString(),
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    bundleCount: inPeriod.length,
    recordCount: inPeriod.reduce((sum, bundle) => sum + bundle.records.length, 0),
    sourceCounts,
    proposalCount: proposals.length,
    proposalKinds,
    highlights: proposals.slice(0, 10).map((proposal) => ({
      proposalId: proposal.id,
      kind: proposal.kind,
      title: proposal.title,
      evidenceCount: proposal.evidenceCount,
      evidenceStrength: proposal.evidenceStrength,
    })),
    note:
      'Studium reports are advisory. No proposal changes Orbis canon until the world owner explicitly reviews and accepts it.',
  };
}
