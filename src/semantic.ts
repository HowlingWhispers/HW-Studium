import type { SourceAuthority } from './contracts.js';

const sourceAuthorityRank: Record<SourceAuthority, number> = {
  model_inference: 1,
  narrative_text: 2,
  structured_signal: 3,
  runtime_state: 4,
  orbis_canon: 5,
};

export function sourceAuthorityStrength(authority: SourceAuthority): number {
  return sourceAuthorityRank[authority];
}

export function compareSourceAuthority(left: SourceAuthority, right: SourceAuthority): number {
  return sourceAuthorityRank[left] - sourceAuthorityRank[right];
}

export function strongestSourceAuthority(authorities: SourceAuthority[]): SourceAuthority | null {
  if (authorities.length === 0) return null;

  return authorities.reduce((strongest, candidate) =>
    sourceAuthorityRank[candidate] > sourceAuthorityRank[strongest] ? candidate : strongest,
  );
}

export function isAtLeastAsAuthoritative(
  candidate: SourceAuthority,
  baseline: SourceAuthority,
): boolean {
  return sourceAuthorityRank[candidate] >= sourceAuthorityRank[baseline];
}
