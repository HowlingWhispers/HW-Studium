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

This is intentionally a backend-first research core. Persistence, authentication, scheduled jobs, source adapters, AI-assisted semantic analysis, and the Orbis review UI follow in later milestones.

## Development

```bash
npm install
npm run dev
```

Build and test:

```bash
npm run lint
npm test
npm run build
```

Default development port: `4310`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/ROADMAP.md](docs/ROADMAP.md).
