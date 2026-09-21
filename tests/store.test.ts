import { describe, expect, it } from 'vitest';
import type { ResearchBundle } from '../src/contracts.js';
import { StudiumStore } from '../src/store.js';

function bundle(summary: string): ResearchBundle {
  return {
    schemaVersion: 'studium.bundle.v1',
    bundleId: 'speculus:session-1:turn-1',
    worldId: 'test-world',
    source: 'speculus',
    capturedAt: '2026-09-21T10:00:00.000Z',
    sanitized: true,
    records: [{
      recordId: 'speculus:v2:session-1:turn-1',
      occurredAt: '2026-09-21T09:59:00.000Z',
      kind: 'speculus_v2_turn',
      summary,
      evidence: [],
      signals: [],
      tags: ['speculus-v2'],
    }],
  };
}

describe('StudiumStore research bundle identity', () => {
  it('updates the same stable bundle when a Speculus turn is rerolled', () => {
    const store = new StudiumStore();
    expect(store.addBundle(bundle('first reply'))).toEqual({ inserted: true, updated: false });
    expect(store.addBundle(bundle('rerolled reply'))).toEqual({ inserted: false, updated: true });

    const bundles = store.listBundlesForWorld('test-world');
    expect(bundles).toHaveLength(1);
    expect(bundles[0].records[0].summary).toBe('rerolled reply');
  });
});
