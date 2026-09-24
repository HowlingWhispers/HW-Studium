# Provider-neutral semantic analyst (Phase 3)

This phase adds a validated extraction boundary, an injectable model-gateway adapter, a fixture-driven mock, and durable advisory analysis results. It does not activate a live model, wire Orbis retrieval, implement proposal synthesis, or write canon.

## Server integration

`SemanticAnalyst.extract(input, signal)` returns `unknown` deliberately. Always call `runSemanticAnalysis` or `analyzeStoredResearch`, which validate the input, output, evidence references and source precedence before returning results. `MockSemanticAnalyst` reproduces fixtures for tests; it does not interpret arbitrary language and is never enabled as a production fallback. `GatewaySemanticAnalyst` forwards separate instructions and serialized data to an injected `ApprovedSemanticTransport`. The transport must decode its provider's response into an object. It receives no raw user provider credentials, caller-selected endpoint or model configuration. Provider access stays behind the approved server/service boundary.

The executable server intentionally does not configure an analyst. Integrators can supply `createApp({ repository, authenticateOwner, semantic: { analyst, context, timeoutMs } })` once approved gateway and Orbis adapters exist. The context resolver is trusted server code. It selects records from stored bundles, attests that they are committed and sanitized, assigns world/session/time scope, fetches a bounded Orbis projection, and supplies verified structured claims. It must enforce its own retrieval timeouts and authorization to the upstream world. Bundle v1's `sanitized: true` alone does not prove a record was committed; the resolver must know the source adapter's commit semantics. An unverified source must not be marked committed. Structured bundle signal text alone does not establish deterministic runtime authority.

Owner endpoints:

- `POST /api/v1/worlds/:worldId/semantic-analysis` accepts an empty body only. Credentials, records, projections and provider URLs cannot be supplied by callers. Unconfigured service returns 503.
- `GET /api/v1/worlds/:worldId/semantic-analyses` returns the latest 50 stored analyses for an authorized world owner.

The existing structured-signal `/analyze` flow is unchanged. Semantic claims are not automatically turned into review proposals; that is Phase 4.

## Contracts and bounds

`studium.semantic-input.v1` carries world ID, extraction version, at most 100 committed sanitized record envelopes, a versioned `studium.canon-projection.v1`, and at most 100 verified structured claims. Projection limits are 200 entities, 500 facts and 50 rules, with bounded strings and aliases. Input and raw model result each have a 512,000-byte ceiling. Oversized inputs fail explicitly; nothing silently truncates evidence. Future batching must preserve these boundaries.

`studium.semantic-result.v1` carries world ID, extraction version, canon revision, explained claims and alias/duplicate candidates. Each claim includes an explicit scope and an explanation connecting its meaning to evidence. The existing claim v1 provenance schema is reused. Model output is limited to 100 claims; trusted structured claims can bring the reconciled result to 200. Unknown properties, malformed values, invented records, foreign worlds, invalid revisions, unknown canonical IDs, duplicate claim IDs, and unsupported authority are rejected as a whole.

Scope is either world-level or `{ kind: "session", sessionId, at }`. `at` identifies a comparable state snapshot/turn, not a guessed date. Runtime facts and state changes must match their cited record scope. World-level canon and later session state are not treated as contradictory merely because values differ. Session claims cannot cite another save or time. This is conservative exact-scope comparison, not an interval-overlap engine.

The model may produce world fact **candidates**, beliefs with holders, rumors, observations, relationship developments, events, state changes, inferences, conflicts or unknowns. It cannot emit `runtime_fact`, impersonate Orbis/runtime authority, invent runtime event IDs, or rebind a canonical identity to a candidate key. Evidence must cite actual supplied records. Potential aliases/duplicates remain separate suggestions; no identity is changed.

Comparable objective candidates that disagree with stronger facts become conflicts, preserving the source explanation and adding conflict references. Matching objective prose inference is suppressed in favor of supplied structured knowledge. Beliefs, rumors and observations retain their categories even when they disagree with canon. A confidence score never grants authority. These checks do not prove linguistic correctness: a future model can misclassify a sentence, so all results remain advisory and require later review. Fixture tests verify the contract and safety behavior, not a real model's extraction accuracy.

## Persistence and freshness

Migration 002 permits an `analysis` document kind in the existing PostgreSQL store. Results retain extraction/canon revisions, creation time, input fingerprint and evidence-stale status. Only validated/reconciled output is persisted; failed or malformed raw provider responses are discarded. Database audit history records creations and invalidations.

Extraction runs outside the database transaction so slow providers do not hold world locks. The service first binds selected evidence back to stored bundles, runs extraction, refreshes the trusted context, and checks the bundle/config snapshot again under the world lock before saving. Rerolls, retractions, configuration changes or context revisions during extraction reject the result. Later bundle/config changes mark stored analyses stale. The canon revision is explicit: Orbis and Studium do not share an atomic distributed transaction, and consumers must compare saved revisions with current canon before future synthesis/review. A canon edit after the final context refresh cannot be prevented by this boundary.

Provider extraction defaults to a 30-second timeout (configurable up to 120 seconds), supports cancellation, and drops output from a non-cooperative timed-out provider. Upstream error text is never returned because it may contain credentials or narrative data. The provider transport remains responsible for cancelling its network work and costs when the abort signal fires.

## Verification

Tests cover belief/rumor/observation preservation, objective contradictions, authored-state versus runtime scope, structured-source precedence, advisory aliases, forged references/authority, malformed and oversized inputs, cancellation/timeout, provider mutation isolation, stale extraction, owner authorization and restart-safe persistence. Local tests use disk-backed PGlite; CI exercises the SQL repository and migrations against PostgreSQL 16.
