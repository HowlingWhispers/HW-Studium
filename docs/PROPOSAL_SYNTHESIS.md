# Evidence-backed proposal synthesis (Phase 4)

Studium now synthesizes review proposals from validated semantic analyses, including their verified runtime/structured claims. Synthesis is deterministic; it makes no model calls and cannot write to Orbis.

## Candidate identity and separation

A stable proposal ID hashes the world, classification, subject identity, predicate, value, holders, relationship direction and exact scope. Display labels, model claim IDs, confidence, input order and extraction run IDs do not define the candidate. A changed value creates a different candidate; additional support for the same meaning preserves identity and creation time.

Beliefs with different holders, rumors, observations, objective candidates and runtime facts are separate groups. Different session/time scopes remain separate. Opposing values never merge. Alternative proposal IDs and source conflict references are available for review; alternatives are not automatically declared contradictions because a world may define multi-valued predicates. Canon comparison facts carry their own scope and revision.

Relationship developments require entity targets and produce explicit source/predicate/target/direction edges. Direction defaults to directed; an explicitly symmetric relationship normalizes endpoint order. Relationship predicates remain world-defined strings, and proposal/entity kinds support `custom:` extensions. No setting-specific entity or relationship names are built into the engine.

## Evidence freshness and support

New analysis records retain a bounded canon projection and fingerprints of all selected source records. Each stored analysis receives a monotonically increasing per-world ordinal inside the database transaction, so equal timestamps cannot make supersession ambiguous. The newest analysis covering a record supersedes earlier output for that record, even when its output is empty. Repeated extraction does not create extra evidence.

A support unit is a distinct `(bundleId, recordId)` pair, with source fingerprint and authority metadata. Model confidence does not increase its count. An analysis is ineligible if any of its input dependencies changed or were retracted. This is deliberately conservative: if a multi-record analysis loses one dependency, all its claims need reanalysis; the system does not assume those claims were independent. Unrelated newly ingested records do not invalidate intact analyses.

Only the canon revision in the latest fingerprinted analysis is used in a synthesis pass. This is a known revision, not proof of the current live Orbis revision. The eventual Orbis review/import adapter must check current canon before import. Old Phase 3 results lacking fingerprints/projection remain readable, but require reanalysis before participating in synthesis.

Thresholds remain conservative=5, balanced=3, exploratory=2, with the existing minEvidence override (2–50). Newly discovered below-threshold candidates are not published to the proposal list. Historical candidates that fall below threshold remain visible with recomputed counts and `evidenceStale: true`; candidates losing all support show zero. They cannot be accepted until eligible again. Config changes recompute thresholds without running a model. Disabled analysis yields no eligible semantic support.

Bundle insertion/replacement/retraction and completed semantic analyses recompute support in the same transaction. Semantic proposals are kept separate from legacy structured-signal proposal reconciliation. `/analyze` and weekly reports include eligible semantic proposals; stale historical candidates remain available in the proposal list but are omitted from report highlights.

## Review and editing

Proposals carry classification, holders, scope, known canon revision, comparison facts, source/claim references, extraction versions, explanations, alternative proposal links, conflict references and structured relationship edges. Their Orbis-shaped drafts include a structured assertion and editable name/summary. These remain drafts; neither acceptance nor editing imports them into Orbis.

- `POST /api/v1/worlds/:worldId/synthesize` accepts an empty body and recomputes semantic proposals without an AI call.
- `PATCH /api/v1/proposals/:proposalId/draft` accepts only `{ name, summary }` and requires the proposal world's owner. Callers cannot edit evidence counts, identity, provenance or assertion classification through this route.
- Existing proposal status and list endpoints continue to work.

Owner text edits persist through synthesis. Editing an accepted draft reopens review. Changed semantic evidence/metadata also reopens a previously accepted proposal once it is eligible again. Unsupported accepted historical proposals remain marked stale and cannot be accepted anew. Original drafts, edits and support transitions remain in the transactional audit history. The review UI and actual Orbis import are subsequent work.

No SQL migration is needed: metadata is additive in existing JSONB documents. Restart tests cover stable identity, evidence support, owner text edits, retraction and restored support on PostgreSQL/PGlite. The implementation still loads a world's documents per transaction; large-world incremental processing is a later scalability task.
