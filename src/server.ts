import { Pool } from 'pg';
import { z } from 'zod';
import { createApp, secretMatches } from './app.js';
import { PostgresResearchRepository } from './repository.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required; the server never falls back to volatile storage.');
// Temporary provisioned owner grants. Replace the resolver with verified Orbis
// identity/ownership checks when that integration is available. No request headers
// or payload fields can declare ownership.
const grants = z.array(z.object({
  token: z.string().min(32),
  subject: z.string().min(1),
  worldIds: z.array(z.string().min(1)).min(1),
})).parse(JSON.parse(process.env.STUDIUM_OWNER_GRANTS ?? '[]'));
if (new Set(grants.map(grant => grant.token)).size !== grants.length) throw new Error('Duplicate owner tokens');
if (grants.some(grant => secretMatches(grant.token, process.env.STUDIUM_INGEST_SECRET ?? ''))) throw new Error('Owner and ingestion credentials must differ');
const pool = new Pool({ connectionString });
const repository = new PostgresResearchRepository(pool);
await repository.migrate();
const app = createApp({ repository, authenticateOwner: async token => grants.find(grant => secretMatches(token, grant.token)) ?? null });
const port = Number(process.env.PORT ?? 4310);
const host = process.env.HOST ?? '127.0.0.1';
const server = app.listen(port, host, () => console.log(`Studium listening on http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => { void pool.end(); });
  });
}
