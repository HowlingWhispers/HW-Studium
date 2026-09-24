# Durable research storage (Living Canon Phase 2)

The executable service requires `DATABASE_URL` and applies versioned migrations before listening. It fails startup on connection or migration failure; it never silently falls back to memory. Build output includes the migration SQL. Back up the PostgreSQL database before deploying schema changes. Migration 001 only creates Studium-owned tables; it does not modify Orbis. No existing durable data source existed in this service; old process-memory data cannot be recovered after that process exits.

## Configuration and authorization

- `DATABASE_URL`: a PostgreSQL connection string, using TLS in remote deployments according to the database provider's configuration.
- `STUDIUM_INGEST_SECRET`: the existing trusted, installation-wide service credential. It can ingest and retract bundles across worlds. It cannot review proposals, read owner history or configure worlds. This remains a trusted backend credential, not a user token; source labels in bundles are not authenticated provider identities.
- `STUDIUM_OWNER_GRANTS`: JSON array of `{ "token": "<at least 32 random characters>", "subject": "<owner identity>", "worldIds": ["<authorized world ID>"] }`. Provision on the server from trusted ownership records. An absent/empty list grants nobody access. Rotate/revoke by updating deployment configuration and restarting. Do not put tokens in a browser bundle or commit them. The owner resolver is injectable for later verified Orbis identity integration; this phase does not claim to implement Discord/Orbis login.
- Owner and ingestion credentials must differ. Owner identity and world grants never come from request bodies or caller-selected identity headers.

All existing owner routes now require an owner bearer token. A proposal's stored world is checked before status changes. `/health` remains public and discloses no research. Existing service ingestion and deletion URLs remain compatible with Speculus. Bundle/proposal identifiers are globally unique within their document kind; attempting to move an existing identity into another world is rejected with 409, including when a bundle is retracted.

## Storage and concurrency

`ResearchRepository` is the asynchronous persistence boundary. `StudiumStore` operates on an isolated world snapshot inside one SQL transaction. The PostgreSQL repository locks that world's row before reading, analyzing and saving changes. Concurrent instances therefore cannot overwrite each other's bundle edits or reviews. Different worlds can proceed independently. Each document stores its typed payload in JSONB, with world and kind indexes; there is no app-wide JSON blob. This first version loads the current world's documents for an operation, which favors simple correctness over high-volume efficiency. Large worlds will need bounded queries and incremental analysis in a later phase.

Bundles, configuration, proposals and reports survive restart. Semantic equality, rather than JSON property order, makes repeated delivery a no-op. Same-ID changed bundles replace active evidence while keeping old payloads in append-only application history. Retraction is a tombstone: it removes evidence from active analysis but preserves its last revision. Explicit re-ingestion restores the bundle and is audited. The v1 protocol has no monotonic revision number, so delivery remains last-committed-write-wins; a delayed old request can restore deleted evidence. A revision-aware outbox protocol is still a separate integration task.

Every committed change records database time, authenticated actor, before/after payload, kind and action in the same transaction. `GET /api/v1/worlds/:worldId/history?after=0` returns up to 100 entries and a `nextCursor`; requests require that world's owner access. History is append-only through the application, not tamper-proof against database administrators. Configure database roles, backups, encryption at rest and TLS operationally; this phase does not implement application-level encryption.

Evidence or configuration changes mark proposals `evidenceStale`. Stale proposals cannot be accepted (409). Reanalysis reconciles the full current proposal set; vanished candidates remain visible as stale historical proposals. Previously accepted stale proposals return to `ready_for_review` if regenerated, requiring fresh review. Other review decisions are retained. Accepted means approved for a later Orbis step, never an Orbis write. Reports are immutable dated snapshots; generate a fresh report after evidence changes.

World config optionally accepts `retention: { reviewAfterDays: number | null, legalHold: boolean }`. These are policy inputs for a future owner-approved retention worker. No worker runs and no evidence is automatically purged; neither elapsed age nor retraction triggers hard deletion.

## Verification

`npm test` exercises the production SQL repository against disk-backed PGlite (PostgreSQL in WASM), closing and reopening the database for restart tests. CI supplies PostgreSQL 16 using `STUDIUM_TEST_DATABASE_URL`, runs the same tests using `pg`, and additionally tests concurrent transactions. **Use a dedicated disposable test database:** this test suite drops the four Studium tables between tests. Never point this variable at production.

Tests cover restart persistence, migration reruns, idempotency, reroll history, durable retraction, restoration, transaction rollback, stale acceptance, cross-world identity collisions, and owner/service authorization separation. `npm run lint` and `npm run build` are also required. The in-memory repository is an explicit lightweight development/test adapter and does not implement durable history.
