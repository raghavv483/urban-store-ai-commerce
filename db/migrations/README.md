# Migration notes — read before running `prisma migrate dev` on this project

This database is a live, shared Supabase Postgres instance (see `CLAUDE.md` and
`.env.local`). Two things about it are not obvious from the schema alone and
will trip up the next `prisma migrate dev`/`prisma migrate deploy` run if you
don't know about them going in.

## 1. The ivfflat index on `knowledge_chunks.embedding` will look "droppable" to Prisma — it is not safe to drop

`knowledge_chunks_embedding_idx` (an `ivfflat (embedding vector_cosine_ops)`
index, created by hand in
`20260826200922_knowledge_chunks_vector_index/migration.sql`) has **no
representation in `db/schema.prisma`**. Prisma's schema language cannot
express ivfflat/pgvector index types, so as far as the schema-diffing engine
is concerned, this index simply doesn't exist in the desired state.

Practical consequence: **any** future `prisma migrate dev` (or `migrate diff
--to-schema db/schema.prisma`) will propose

```sql
-- DropIndex
DROP INDEX "knowledge_chunks_embedding_idx";
```

as part of its generated migration — even for a change that has nothing to do
with `knowledge_chunks`. This is not Prisma detecting an actual problem; it's
Prisma reconciling the DB toward a schema that never described this index in
the first place.

**If you see that line in a generated migration, do not apply it as-is.**
Delete the `DROP INDEX "knowledge_chunks_embedding_idx";` statement, and
instead append (or keep) the original hand-written statement:

```sql
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
  ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);
```

Day 4's RAG retrieval depends on this index existing. `db/schema.test.ts` has
a regression test (`"keeps the ivfflat index on knowledge_chunks.embedding"`)
that will fail if it's ever actually dropped — run it after any migration
that touches this table.

(As of this note, `postgresqlExtensions` / `extensions = [vector]` have been
removed from `db/schema.prisma` specifically so Prisma stops diffing
*extensions* — see item 2 below — but that change does nothing for this index
problem, since indexes and extensions are diffed independently and the ivfflat
index was never representable in the schema either way.)

## 2. `prisma migrate dev` may propose a full destructive reset — do not run it

The first `migrate dev` run against this database (Task 2) hit Prisma's
drift-detection reset path:

```
Drift detected: Your database schema is not in sync with your migration history.
[+] Added extensions
  - pg_stat_statements
  - pgcrypto
  - supabase_vault
  - uuid-ossp
  - vector
We need to reset the "public" schema at "<host>"
You may use prisma migrate reset to drop the development database.
All data will be lost.
```

This happened because Supabase pre-installs several extensions
(`pg_stat_statements`, `pgcrypto`, `uuid-ossp` in the `extensions` schema;
`supabase_vault` in `vault`) into every project before any Prisma migration
ever runs, and (at the time) `postgresqlExtensions` + `extensions = [vector]`
in `schema.prisma` made Prisma track and diff extensions at all, so it saw
those pre-existing, unmanaged extensions as "drift" on a schema with empty
migration history. `previewFeatures = ["postgresqlExtensions"]` and
`extensions = [vector]` have since been removed from `db/schema.prisma` for
exactly this reason — the `vector` extension is still enabled (it was created
by raw SQL at the top of migration 1: `CREATE EXTENSION IF NOT EXISTS
"vector";`), Prisma just no longer tracks or diffs extension state, so this
specific trigger should not recur. Re-verify with a read-only
`prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script`
before trusting that, though — Supabase or Prisma behavior can change.

**Never run `prisma migrate reset` or `prisma db push --force-reset` (or
anything else that drops/recreates the schema) against this database.** If
`migrate dev` proposes a reset for any reason — this one or a new one — do not
accept it. Use the baseline procedure instead, which never touches drift
detection or the shadow database:

1. `prisma migrate diff --from-empty --to-schema db/schema.prisma --script --output db/migrations/<timestamp>_<name>/migration.sql`
   (diffs an empty datamodel against the schema file directly — no connection
   to, or comparison against, the target database at all). If you're adding a
   migration on top of existing tables rather than starting fresh, use
   `--from-schema-datasource --to-schema db/schema.prisma` instead of
   `--from-empty`, so the diff is against the live DB state rather than
   nothing.
2. Review the generated SQL by eye. Remove any `DROP INDEX
   "knowledge_chunks_embedding_idx"` per item 1 above, and re-add the ivfflat
   `CREATE INDEX` if the index isn't already present.
3. `prisma db execute --file <path-to-migration.sql>` — applies the SQL
   directly. This command has no drift/shadow-database logic; it just runs
   the script.
4. `prisma migrate resolve --applied <timestamp>_<name>` — records the
   migration as applied in Prisma's `_prisma_migrations` table without
   re-running it.
5. `prisma migrate status` — confirm it reports "Database schema is up to
   date!" with no drift.

Full details and the exact commands/output from doing this the first time are
in `.superpowers/sdd/2026-08-27-day1-foundation/task-2-report.md`.
