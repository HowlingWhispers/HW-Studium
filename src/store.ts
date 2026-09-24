import { synthesizeSemanticProposals } from './proposal-synthesis.js';
import { researchFingerprint } from './semantic-service.js';
import { storedSemanticAnalysisSchema, type StoredSemanticAnalysis } from './semantic-service.js';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type {
  ProposalStatus,
  ResearchBundle,
  StudiumProposal,
  WeeklyWorldReport,
  WorldConfig,
} from './contracts.js';

export interface StoreDocument { kind: 'bundle' | 'config' | 'proposal' | 'report' | 'analysis'; id: string; value: unknown }

export class StudiumStore {
  constructor(documents: StoreDocument[] = []) {
    for (const document of structuredClone(documents)) {
      switch (document.kind) {
        case 'analysis': this.analyses.set(document.id, storedSemanticAnalysisSchema.parse(document.value)); break;
        case 'bundle': this.bundles.set(document.id, document.value as ResearchBundle); break;
        case 'config': this.configs.set(document.id, document.value as WorldConfig); break;
        case 'proposal': this.proposals.set(document.id, document.value as StudiumProposal); break;
        case 'report': {
          const report = document.value as WeeklyWorldReport;
          const list = this.reports.get(report.worldId) ?? [];
          list.push(report);
          this.reports.set(report.worldId, list);
          break;
        }
      }
    }
  }

  documents(): StoreDocument[] {
    return structuredClone([
      ...[...this.analyses].map(([id, value]) => ({ kind: 'analysis' as const, id, value })),
      ...[...this.bundles].map(([id, value]) => ({ kind: 'bundle' as const, id, value })),
      ...[...this.configs].map(([id, value]) => ({ kind: 'config' as const, id, value })),
      ...[...this.proposals].map(([id, value]) => ({ kind: 'proposal' as const, id, value })),
      ...[...this.reports.values()].flat().map(value => ({ kind: 'report' as const, id: value.id!, value })),
    ]);
  }

  addSemanticAnalysis(analysis: StoredSemanticAnalysis): StoredSemanticAnalysis {
    const value = storedSemanticAnalysisSchema.parse({ ...analysis, ordinal: [...this.analyses.values()].filter(a => a.worldId === analysis.worldId).reduce((max, a) => Math.max(max, a.ordinal ?? 0), 0) + 1 });
    this.analyses.set(value.id, value);
    this.synthesizeProposals(value.worldId);
    return value;
  }

  listSemanticAnalyses(worldId: string): StoredSemanticAnalysis[] {
    return [...this.analyses.values()].filter(value => value.worldId === worldId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
  }

  private analyses = new Map<string, StoredSemanticAnalysis>();

  synthesizeProposals(worldId: string): StudiumProposal[] {
    const next = synthesizeSemanticProposals(worldId, this.listBundlesForWorld(worldId), [...this.analyses.values()], this.getWorldConfig(worldId), this.listProposals(worldId));
    return this.upsertProposals(next);
  }

  private invalidate(worldId: string) {
    for (const analysis of this.analyses.values()) {
      if (analysis.worldId !== worldId) continue;
      const changed = !analysis.sourceBindings || analysis.sourceBindings.some(binding => {
        const bundle = this.bundles.get(binding.bundleId);
        const record = bundle?.records.find(record => record.recordId === binding.recordId);
        return !bundle || !record || researchFingerprint(bundle, record) !== binding.fingerprint;
      });
      if (changed) analysis.evidenceStale = true;
    }
    for (const proposal of this.proposals.values()) {
      if (proposal.worldId === worldId && !proposal.semantic && !proposal.evidenceStale) {
        proposal.evidenceStale = true;
        proposal.updatedAt = new Date().toISOString();
      }
    }
    this.synthesizeProposals(worldId);
  }

  reconcileProposals(worldId: string, next: StudiumProposal[]): StudiumProposal[] {
    const ids = new Set(next.map(proposal => proposal.id));
    for (const proposal of this.proposals.values()) {
      if (proposal.worldId === worldId && !proposal.semantic && !ids.has(proposal.id) && !proposal.evidenceStale) {
        proposal.evidenceStale = true;
        proposal.updatedAt = new Date().toISOString();
      }
    }
    return this.upsertProposals(next);
  }

  getProposal(id: string): StudiumProposal | null { return this.proposals.get(id) ?? null; }

  private bundles = new Map<string, ResearchBundle>();
  private configs = new Map<string, WorldConfig>();
  private proposals = new Map<string, StudiumProposal>();
  private reports = new Map<string, WeeklyWorldReport[]>();

  addBundle(bundle: ResearchBundle): { inserted: boolean; updated: boolean } {
    const existing = this.bundles.get(bundle.bundleId);
    if (!existing) {
      this.bundles.set(bundle.bundleId, structuredClone(bundle));
      this.invalidate(bundle.worldId);
      return { inserted: true, updated: false };
    }

    if (isDeepStrictEqual(existing, bundle)) {
      return { inserted: false, updated: false };
    }

    this.bundles.set(bundle.bundleId, structuredClone(bundle));
    this.invalidate(bundle.worldId);
    return { inserted: false, updated: true };
  }

  removeBundle(bundleId: string): boolean {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) return false;
    this.bundles.delete(bundleId);
    this.invalidate(bundle.worldId);
    return true;
  }

  listBundlesForWorld(worldId: string): ResearchBundle[] {
    return [...this.bundles.values()].filter((bundle) => bundle.worldId === worldId);
  }

  setWorldConfig(config: WorldConfig): WorldConfig {
    const changed = !isDeepStrictEqual(this.getWorldConfig(config.worldId), config);
    this.configs.set(config.worldId, config);
    if (changed) this.invalidate(config.worldId);
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
      const semanticChanged = existing?.semantic && !isDeepStrictEqual(existing.semantic, proposal.semantic);
      const value = existing
        ? {
            ...proposal,
            status: (existing.evidenceStale || semanticChanged) && existing.status === 'accepted' && !proposal.evidenceStale ? 'ready_for_review' as const : existing.status,
            draftEdited: existing.draftEdited,
            orbisDraft: existing.draftEdited ? { ...proposal.orbisDraft, name: existing.orbisDraft.name, summary: existing.orbisDraft.summary } : proposal.orbisDraft,
            createdAt: existing.createdAt,
            updatedAt: proposal.updatedAt,
          }
        : proposal;

      value.evidenceStale = proposal.evidenceStale ?? false;
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
    if (proposal.evidenceStale && status === 'accepted') throw new Error('proposal_evidence_stale');

    const updated: StudiumProposal = {
      ...proposal,
      status,
      updatedAt: new Date().toISOString(),
    };

    this.proposals.set(id, updated);
    return updated;
  }

  editProposalDraft(id: string, edit: { name: string; summary: string }): StudiumProposal | null {
    const proposal = this.proposals.get(id);
    if (!proposal) return null;
    const updated = { ...proposal, orbisDraft: { ...proposal.orbisDraft, ...edit }, draftEdited: true,
      status: proposal.status === 'accepted' ? 'ready_for_review' as const : proposal.status, updatedAt: new Date().toISOString() };
    this.proposals.set(id, updated);
    return updated;
  }

  addReport(report: WeeklyWorldReport): WeeklyWorldReport {
    report = { ...report, id: randomUUID() };
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
