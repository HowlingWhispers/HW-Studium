# Studium architecture

## The lifecycle

Studium closes the Howling Whispers world-development loop:

```text
             +-----------------------------------------------+
             |                                               |
             v                                               |
          ORBIS -> SPECULUS -> FABULA -> STUDIUM ------------+
          canon    simulation   runtime    research
```

This is not a chain where Studium becomes the new source of truth.

**Orbis remains canonical.**

Studium observes what happens downstream and returns **evidence-backed proposals** to the owner.

## Responsibilities

### Orbis

Owns canonical authored records and approved canon changes.

Studium may prepare an Orbis-shaped draft, but Studium has no direct canon-write operation.

### Speculus

Produces roleplay and simulation history. Current Speculus V2 and V3 adapters sanitize committed turn text and small world metadata into Studium research bundles. Rerolls replace the same stable turn bundle and deleted turns issue a retraction.

### Fabula

Produces persistent runtime history: travel, relationships, jobs, economy, encounters, settlements, consequences, discovered patterns, and other world-state developments.

A future Fabula adapter will emit the same Studium bundle format.

### Studium

Studium owns:

- research-bundle ingestion
- analysis configuration per world
- evidence clustering
- weekly development reports
- inconsistency detection
- emerging entity and relationship proposals
- Orbis-ready proposal drafts
- proposal lifecycle and review history

Studium does **not** own:

- canonical characters
- canonical places
- canonical families
- canonical factions
- canonical world lore
- player runtime state

## Data minimization

Studium should not require complete raw roleplay logs by default.

Source systems should produce sanitized research bundles containing only the material needed for analysis. Bundle schema v1 requires `sanitized: true`; unsanitized bundles are rejected.

Service-to-service ingestion is authenticated. Durable encrypted storage, retention controls and a retry/outbox layer are still required before production research history should be trusted across restarts or outages.

## Signals

The first analyzer consumes structured signals:

- `entity_candidate`
- `relationship_candidate`
- `canon_conflict`
- `emergent_lore`

This lets the ingestion and proposal machinery be built before the semantic AI analyst is introduced.

Later, Studium's analysis layer can derive these signals itself from sanitized Speculus/Fabula history.

## Analysis modes

A world owner may choose:

- **Conservative**: require strong repetition before proposing development.
- **Balanced**: default threshold.
- **Exploratory**: surface emerging patterns earlier.

A world can also override the evidence threshold directly.

## Proposal safety rule

Every generated proposal is advisory.

Even an `accepted` Studium proposal means the owner approved the proposal for the next Orbis step. It does not itself mutate Orbis.

The eventual Orbis integration should use an explicit review/import operation with world-owner authorization.
