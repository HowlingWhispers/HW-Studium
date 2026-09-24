# Living World Canon Architecture

Status: architecture proposal for implementation
Scope: Howling Whispers ecosystem, world-agnostic
Primary owner of research/proposals: Studium
Canonical authority: Orbis
Runtime authority: Speculus V3 today, Fabula later

## Purpose

Howling Whispers needs a general system that can observe play, identify durable developments, detect contradictions, and propose canon updates without silently rewriting the authored world.

This is not a Bitterroot-specific lore manager. Bitterroot is a proving ground. The contracts must support unrelated worlds with different genres, species, technologies, magic, cultures, mechanics, and narrative assumptions.

The system is inspired by recurring patterns observed in NovelAI tooling such as Story Engine and Lorebook Manager: staged generation, review before commit, entity binding, refinement, and updating lore from recent story context. The Howling Whispers implementation must remain original and must preserve the stronger existing boundaries between authored canon, runtime truth, character knowledge, and research proposals.

## Non-negotiable ownership boundaries

### Orbis

Orbis owns canonical authored reality:

- stable entity identity
- canonical asset documents
- canonical relationships
- world structure
- World Brain revisions
- authored rules and system definitions
- owner-controlled revision history
- import/export and validation

Only an explicit owner-authorized Orbis operation may turn a proposal into authored canon.

### Speculus

Speculus owns mutable simulation state for a launched session:

- committed turns and stable turn IDs
- clock, location, presence and travel state
- runtime relationships
- runtime knowledge
- runtime inventory/resources/conditions
- deterministic action resolution
- reroll/delete/undo semantics

Generated prose is not authoritative state.

### Fabula

Fabula will eventually own persistent gameplay/runtime state using the same separation between canon and mutable lived state. It should be able to emit the same research bundle contract as Speculus.

### Studium

Studium owns observation and research:

- sanitized research ingestion
- evidence clustering
- semantic extraction
- contradiction detection
- emerging entity/relationship/lore proposals
- proposal history
- evidence-backed Orbis-shaped drafts

Studium never directly writes canon.

## Core principle: three truths, not one

The platform must keep these distinct:

1. Canonical truth: what Orbis says is authored reality.
2. Runtime truth: what deterministic runtime state says is currently true in this save/session.
3. Epistemic truth: what an actor, faction, narrator, document, rumor, or observer believes or claims.

Example:

- Canonical truth: beastfolk exist.
- Runtime truth: Ragna is currently at the Ranger Station.
- Epistemic truth: Ragna believes beastfolk are fictional.

A sentence in prose must never be promoted to canonical truth merely because a model stated it.

## Source precedence

When multiple forms of evidence exist, Studium should prefer stronger structured sources over prose inference.

Highest to lowest default authority for research interpretation:

1. explicit Orbis canonical record/revision
2. deterministic committed runtime state/event
3. structured source-system signal
4. committed narrative turn text
5. model-derived inference from text

Lower-authority evidence may identify a conflict but must not overwrite higher-authority evidence.

## Semantic claim model

The current Studium signal layer is intentionally small. The semantic analyst should add a claim layer rather than forcing every observation directly into a canon proposal.

A claim candidate should carry:

- stable claim ID
- world ID
- source record IDs
- subject: canonical reference when known, otherwise candidate identity
- predicate or claim type
- object/value
- temporal scope when relevant
- location scope when relevant
- confidence
- evidence excerpts or structured evidence references
- epistemic classification
- holder/observer references for subjective claims
- canonical references
- conflict references
- extraction version

Recommended epistemic classifications:

- world_fact_candidate: appears to describe objective setting truth
- runtime_fact: current mutable state already supported by runtime authority
- character_belief: belief held by one or more actors
- faction_belief: belief/position held by a group
- rumor: circulated claim without objective confirmation
- observation: perception from a bounded point of view
- relationship_development: durable interpersonal development
- event: something that happened
- state_change: inventory, ownership, condition, location, resource, or similar mutable change
- inference: model interpretation not directly stated
- conflict: contradiction with stronger evidence
- unknown: cannot be classified safely

World authors may add world-specific tags or predicates without changing the platform's core epistemic classifications.

## Entity model

Do not make the engine depend on Bitterroot's categories.

The platform should retain a small set of common entity kinds for interoperability but allow extension types.

Common examples:

- character
- place
- faction
- family/household
- species
- culture/society
- item
- event
- system/concept
- relationship

World-specific kinds must be representable through a namespaced extension identifier rather than requiring core code changes for every new setting.

Examples:

- custom:starship_class
- custom:spell_school
- custom:religious_order

The semantic analyst may suggest a category, but Orbis remains responsible for deciding which authored record type is valid.

## Relationships

Relationships should be first-class graph edges, not prose-only grouping.

A relationship proposal should support:

- source entity
- relationship type
- target entity
- directed or symmetric semantics
- temporal validity
- authored seed versus runtime development
- evidence record IDs
- confidence
- world-specific metadata

Worlds may define custom relationship predicates. Core code must not assume that every relationship is interpersonal.

## Events and provenance

Every proposal must be traceable back to source evidence.

Minimum provenance:

- world ID
- source system
- source bundle ID
- source record ID
- stable runtime turn/event ID when available
- capture time
- occurrence time
- analyzer/extractor version
- canonical revision(s) used during comparison

If a Speculus turn is rerolled, the replacement must update the same research lineage. If a turn is deleted, its research evidence must be retracted so stale proposals can lose support.

## Proposal lifecycle

Studium proposals remain advisory:

draft -> ready_for_review -> accepted | rejected | deferred

Accepted means accepted for the Orbis review/import step. It does not mean canon changed.

The Orbis review flow should provide:

- existing canon side-by-side with proposed material
- evidence list with source links/IDs
- detected conflicts
- edit-before-import
- accept/import
- reject
- defer
- visible provenance
- no automatic publication

The imported Orbis object should retain a provenance reference to the Studium proposal and evidence lineage.

## Canon promotion policy

Not everything that happens in play belongs in canon.

Examples of likely promotion candidates:

- a repeatedly established unnamed settlement
- an emergent relationship that the owner wants to preserve as authored history
- a recurring local custom
- a new faction repeatedly established across play
- a discovered historical fact consistent with world rules

Examples that normally remain runtime state:

- current inventory count
- current injury
- present location
- current money
- temporary mood
- one save's unresolved encounter

Studium may propose that runtime developments become authored history, but the owner decides.

## Semantic analyst architecture

The semantic analyst must be provider-neutral.

Recommended boundary:

    interface SemanticAnalyst {
      extract(input: {
        worldId: string;
        records: ResearchRecord[];
        canonProjection: CanonProjection;
        extractionVersion: string;
        signal?: AbortSignal;
      }): Promise<SemanticAnalysisResult>;
    }

The interface should be testable with a deterministic mock implementation.

Studium should not receive raw user provider credentials. If model-backed analysis uses an external provider, credentials remain behind an approved Orbis/server boundary or a dedicated service credential mechanism.

Model output is untrusted input. It must be schema-validated before entering the store.

## Canon projection

Semantic analysis needs a bounded view of existing canon to distinguish a new entity from a renamed existing one and a development from a contradiction.

Studium should consume a versioned, sanitized canon projection rather than reaching directly into Orbis tables.

A projection may include:

- stable canonical IDs
- entity names and aliases
- entity types
- short canonical summaries
- relationship summaries
- selected world rules
- revision identifiers

It should not include provider credentials or unrelated private account data.

## Analysis pipeline

Preferred flow:

    Speculus/Fabula committed event
              |
              v
    sanitized research bundle
              |
              +---- structured deterministic signals
              |
              v
    Studium durable store
              |
              v
    semantic extraction
              |
              v
    claim candidates
              |
              v
    source-precedence + conflict checks
              |
              v
    evidence clustering
              |
              v
    proposal candidates
              |
              v
    Studium owner/research review
              |
              v
    Orbis proposal inbox
              |
              v
    owner edit + explicit import
              |
              v
    Orbis draft/revision

Structured deterministic signals should bypass unnecessary prose re-inference where possible.

## World-agnostic rules

Implementation must pass these tests conceptually:

- a medieval fantasy world can define magic without core changes
- a hard-science setting can define spacecraft and communications constraints without core changes
- a modern setting can define institutions and legal entities without core changes
- a world with no non-human species is not forced to carry species mechanics
- a world can define custom entity and relationship types
- character beliefs can contradict canon without producing a canon rewrite
- runtime state can differ from authored starting state without being treated as a contradiction
- two saves can develop differently while referencing the same Orbis canon

## Delivery sequence

### Phase 1: semantic contracts

Goal: make it possible to represent claims safely before adding model analysis.

- add claim/epistemic contracts
- add extension-friendly entity typing
- add provenance fields
- add source-precedence helpers
- add tests for fact versus belief versus rumor versus runtime state

No external AI call is required for this phase.

### Phase 2: durable Studium

Goal: research evidence and proposal state survive restart and can be audited.

- PostgreSQL persistence
- migrations
- audit history
- retention/retraction handling
- world-owner/service authorization
- preserve reroll replacement and delete retraction semantics

### Phase 3: semantic analyst

Goal: derive structured claims from sanitized committed narrative where structured signals are absent.

- provider-neutral interface
- deterministic mock analyst
- schema-validated model adapter
- extraction versioning
- bounded canon projection
- duplicate/alias resolution candidates
- belief/rumor/observation classification
- conflict detection
- evidence explanation

### Phase 4: proposal synthesis

Goal: turn claims into useful, evidence-backed review proposals.

- cluster compatible claims
- keep contradictory claim sets separate
- combine structured runtime evidence with semantic evidence
- maintain proposal support counts as evidence is replaced/retracted
- generate editable Orbis-shaped drafts
- do not mutate canon

### Phase 5: Orbis proposal inbox

Goal: world owner can review Studium output without leaving Orbis.

- list proposals for worlds the user owns
- side-by-side existing canon/proposal comparison
- evidence and provenance display
- accept/edit/reject/defer
- create an Orbis draft/revision only through explicit owner action
- preserve proposal/evidence lineage

### Phase 6: authoring/genesis

Goal: extend the same safe review primitives to creation from sparse or empty worlds.

This is where Story Engine-like brainstorm/foundation/forge ideas become relevant.

- world contract / World Brain assistance
- staged sketch, expand, weave workflow
- entity and relationship draft generation
- import/bind existing unstructured lore
- never silently replace source material
- reuse the same review, provenance and validation infrastructure

This phase is deliberately after Living Canon foundations. Creation and observation should share contracts, not become two unrelated systems.

## Explicit exclusions from the first implementation

Do not:

- make Bitterroot assumptions part of core schemas
- let Studium write Orbis canon directly
- parse prose to reconstruct deterministic inventory/travel state when structured state exists
- put the semantic analyzer inside Speculus UI/runtime
- change Speculus release behavior merely to build this feature
- turn every runtime event into canonical lore
- create per-character independent rule engines
- expose raw provider credentials to Studium
- regenerate whole canon records when a field-level proposal is sufficient
- discard evidence after a proposal is accepted

## First implementation target

The next coding task should be Phase 1: semantic contracts in HW-Studium.

Completion criteria:

1. Existing bundle v1 ingestion remains compatible.
2. New semantic claim schemas distinguish objective candidates, runtime facts, beliefs, rumors, observations, relationships, events, state changes, inferences, conflicts, and unknowns.
3. Claims reference source records and canonical IDs without requiring Bitterroot entity types.
4. Extension entity kinds can be represented safely.
5. Source-precedence logic has unit tests.
6. Existing analyzer/API/store tests continue to pass.
7. No external AI/provider integration is introduced yet.
8. No Orbis canon-write route is added.
