# Studium roadmap

Detailed architecture and sequencing for the world-agnostic canon-development system lives in [LIVING_WORLD_CANON.md](./LIVING_WORLD_CANON.md).

## 0.1 - Research core

- [x] Define sanitized research-bundle v1
- [x] Ingest Speculus/Fabula bundles
- [x] Per-world analysis modes
- [x] Repeated-signal analyzer
- [x] Weekly report generator
- [x] Orbis-shaped proposal drafts
- [x] Proposal review states
- [x] Enforce no direct canon write path

## 0.2 - Durable service

- [ ] PostgreSQL persistence
- [ ] migrations
- [ ] authenticated world-owner access
- [ ] encrypted research storage
- [ ] audit history
- [ ] retention controls
- [ ] per-world source permissions

## 0.3 - Ecosystem adapters

- [x] Speculus V2/V3 research-bundle exporter
- [x] Stable reroll replacement and deleted-turn retraction
- [ ] Fabula runtime-bundle exporter
- [ ] bundle signing/version validation
- [ ] scheduled weekly analysis
- [ ] scheduled owner digest delivery

## 0.4 - Semantic analyst

### 0.4a - Semantic contracts

- [ ] classify world fact candidates, runtime facts, beliefs, rumors, observations, relationship developments, events, state changes, inferences, conflicts and unknowns
- [ ] support extension-friendly world entity kinds
- [ ] add provenance and extraction-version contracts
- [ ] add source-precedence helpers and tests
- [ ] keep research-bundle v1 backward compatible

### 0.4b - Semantic extraction

- [ ] provider-neutral SemanticAnalyst interface
- [ ] deterministic mock analyst for tests
- [ ] analyze sanitized prose/session history
- [ ] derive structured claims and signals automatically
- [ ] validate all model output before storage
- [ ] consume a bounded, versioned Orbis canon projection
- [ ] detect recurring unnamed places
- [ ] detect emerging families and households
- [ ] detect developing relationships
- [ ] detect new factions/customs/traditions
- [ ] detect recurring local events and history
- [ ] distinguish belief/rumor/observation from objective canon
- [ ] detect canon/runtime contradictions
- [ ] explain evidence behind every suggestion

## 0.5 - Orbis review loop

- [ ] Studium proposal inbox in Orbis
- [ ] side-by-side canon comparison
- [ ] evidence/provenance display
- [ ] accept / edit / reject / defer
- [ ] convert proposals into Orbis record drafts
- [ ] owner-controlled publication
- [ ] preserve evidence trail back to Speculus/Fabula

## 0.6 - Research lab

- [ ] trend analysis across longer periods
- [ ] simulation regression detection
- [ ] character behavior drift detection
- [ ] world coverage/gap analysis
- [ ] configurable research questions
- [ ] project-owner research tools

## Later - Genesis / sparse-world authoring

After the Living Canon contracts and review flow are stable:

- [ ] world-contract / World Brain assistance
- [ ] staged sketch / expand / weave authoring
- [ ] entity and relationship draft generation
- [ ] import/bind existing unstructured lore
- [ ] reuse proposal, provenance and owner-review infrastructure
