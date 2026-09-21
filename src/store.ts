import type {
  ProposalStatus,
  ResearchBundle,
  StudiumProposal,
  WeeklyWorldReport,
  WorldConfig,
} from './contracts.js';

export class StudiumStore {
  private bundles = new Map<string, ResearchBundle>();
  private configs = new Map<string, WorldConfig>();
  private proposals = new Map<string, StudiumProposal>();
  private reports = new Map<string, WeeklyWorldReport[]>();

  addBundle(bundle: ResearchBundle): { inserted: boolean } {
    if (this.bundles.has(bundle.bundleId)) return { inserted: false };
    this.bundles.set(bundle.bundleId, bundle);
    return { inserted: true };
  }

  listBundlesForWorld(worldId: string): ResearchBundle[] {
    return [...this.bundles.values()].filter((bundle) => bundle.worldId === worldId);
  }

  setWorldConfig(config: WorldConfig): WorldConfig {
    this.configs.set(config.worldId, config);
    return config;
  }

  getWorldConfig(worldId: string): WorldConfig {
    return (
      this.configs.get(worldId) ?? {
        worldId,
        mode: 'balanced',
        reviewCadence: 'weekly',
        enabled: true,
      }
    );
  }

  upsertProposals(next: StudiumProposal[]): StudiumProposal[] {
    const merged: StudiumProposal[] = [];

    for (const proposal of next) {
      const existing = this.proposals.get(proposal.id);
      const value = existing
        ? {
            ...proposal,
            status: existing.status,
            createdAt: existing.createdAt,
            updatedAt: proposal.updatedAt,
          }
        : proposal;

      this.proposals.set(value.id, value);
      merged.push(value);
    }

    return merged;
  }

  listProposals(worldId: string): StudiumProposal[] {
    return [...this.proposals.values()]
      .filter((proposal) => proposal.worldId === worldId)
      .sort((a, b) => b.evidenceCount - a.evidenceCount);
  }

  updateProposalStatus(id: string, status: ProposalStatus): StudiumProposal | null {
    const proposal = this.proposals.get(id);
    if (!proposal) return null;

    const updated: StudiumProposal = {
      ...proposal,
      status,
      updatedAt: new Date().toISOString(),
    };

    this.proposals.set(id, updated);
    return updated;
  }

  addReport(report: WeeklyWorldReport): WeeklyWorldReport {
    const list = this.reports.get(report.worldId) ?? [];
    list.push(report);
    this.reports.set(report.worldId, list);
    return report;
  }

  latestReport(worldId: string): WeeklyWorldReport | null {
    const list = this.reports.get(worldId) ?? [];
    return list.at(-1) ?? null;
  }
}
