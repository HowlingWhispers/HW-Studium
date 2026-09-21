import { describe, expect, it } from 'vitest';
import { analyzeWorld } from '../src/analyzer.js';
import type { ResearchRecord, WorldConfig } from '../src/contracts.js';

const config: WorldConfig = {
  worldId: 'test-world',
  mode: 'balanced',
  reviewCadence: 'weekly',
  enabled: true,
};

function record(id: string): ResearchRecord {
  return {
    recordId: id,
    occurredAt: '2026-09-20T12:00:00.000Z',
    kind: 'roleplay_observation',
    summary: 'The same unnamed settlement was visited again.',
    evidence: [],
    tags: [],
    signals: [
      {
        type: 'entity_candidate',
        key: 'place:recurring-crossing',
        label: 'Recurring Crossing',
        entityType: 'place',
        canonicalRefs: [],
        details: 'A recurring settlement-like location is appearing in play but has no Orbis place reference.',
      },
    ],
  };
}

describe('analyzeWorld', () => {
  it('creates a review proposal after the balanced evidence threshold is reached', () => {
    const proposals = analyzeWorld(
      'test-world',
      [record('r1'), record('r2'), record('r3')],
      config,
      new Date('2026-09-21T12:00:00.000Z'),
    );

    expect(proposals).toHaveLength(1);
    expect(proposals[0].kind).toBe('place');
    expect(proposals[0].title).toBe('Recurring Crossing');
    expect(proposals[0].status).toBe('ready_for_review');
    expect(proposals[0].orbisDraft.source).toBe('studium-proposal');
  });

  it('does not propose weak one-off observations', () => {
    expect(analyzeWorld('test-world', [record('r1')], config)).toHaveLength(0);
  });
});
