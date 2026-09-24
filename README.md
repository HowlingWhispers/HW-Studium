# HW-Studium

**Studium** is the research and world-development analysis layer of the Howling Whispers ecosystem.

The core lifecycle is:

```text
Orbis -> Speculus -> Fabula -> Studium -> Orbis
 ^                                      |
 +--------------------------------------+
```

- **Orbis** is the source of canonical world data.
- **Speculus** produces simulation and roleplay history from that canon.
- **Fabula** produces persistent runtime history and consequences.
- **Studium** studies sanitized history from Speculus and Fabula, detects recurring developments and inconsistencies, and prepares reports and proposals.
- **Orbis** receives only owner-reviewed proposals. Studium does not silently rewrite canon.

## First implementation milestone

The initial service implements:

- sanitized research-bundle ingestion from Speculus and Fabula
- per-world analysis configuration
- repeated-signal analysis
- weekly world-development report generation
- Orbis-ready proposal drafts
- explicit proposal review states
- no direct canon write path

This is intentionally a backend-first research core. PostgreSQL persistence and a provisioned world-owner authorization boundary are included. Scheduled jobs, AI-assisted semantic analysis, Orbis identity integration, and the Orbis review UI follow in later milestones.

## Development

```bash
npm install
export DATABASE_URL=postgres://localhost/studium
npm run dev
```

Build and test:

```bash
npm run lint
npm test
npm run build
```

Default development port: `4310`.

Research ingestion requires a service secret:

```env
STUDIUM_INGEST_SECRET=<shared service-to-service secret>
```

Speculus and future Fabula adapters authenticate to Studium with this secret.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

See [durable storage operations](docs/STORAGE.md) for migrations, owner grants, audit history, retention and tests.

The [semantic analyst boundary](docs/SEMANTIC_ANALYST.md) supports provider-neutral extraction, evidence validation and durable advisory results. Live gateway and Orbis context adapters must be supplied by an approved server integration; no model is activated by default.

[Proposal synthesis](docs/PROPOSAL_SYNTHESIS.md) clusters current semantic evidence into owner-reviewable drafts, including relationship edges, source provenance and editable draft text.
