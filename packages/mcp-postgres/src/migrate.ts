import { readFileSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { sql } from "drizzle-orm"
import { readMigrationFiles } from "drizzle-orm/migrator"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { migrate as apply } from "drizzle-orm/node-postgres/migrator"
import { quote } from "./names"

/**
 * The evidence chain's functions and triggers, which drizzle cannot express: the text of `sql/evidence-chain.sql`, with `--> statement-breakpoint`
 * between statements. Each server's drizzle folder holds it as its custom migration `0001_evidence_chain.sql`, right after `0000_initial.sql`
 * creates the tables, and a test keeps the file equal to this.
 */
export const evidenceChainSql = readFileSync(new URL("../sql/evidence-chain.sql", import.meta.url), "utf8")

/** This package's own drizzle folder, which its tests migrate; a server names its own. */
export const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url))

/**
 * Apply the folder's pending migrations in one transaction, as drizzle's migrator does, after refusing what it would silently mishandle: it records
 * each file's hash and journal time but compares neither, so an applied file that was edited would be ignored and a regenerated one would run again.
 * An applied file that is not the one in the folder refuses the run, naming it. A receipt past the folder's last file belongs to a newer image, as
 * when a tag goes back: the database is ahead, the run says so, and drizzle finds nothing newer than the last receipt and applies nothing. The receipts
 * are drizzle's, in `<schema>.__drizzle_migrations`: `schema` is `drizzle` unless given; an MCP's are in its own schema, which drizzle creates when missing.
 */
export async function migrate(db: NodePgDatabase, { folder, schema = "drizzle" }: { folder: string; schema?: string }): Promise<void> {
  const files = readMigrationFiles({ migrationsFolder: folder })
  const { entries } = JSON.parse(await readFile(`${folder}/meta/_journal.json`, "utf8")) as { entries: { tag: string }[] }
  const receipts = `${quote(schema)}.__drizzle_migrations`
  const applied = (await db.execute<{ applied: boolean }>(sql`select to_regclass(${receipts}) is not null as applied`)).rows[0]!.applied
    ? (await db.execute<{ hash: string; created_at: string }>(sql`select hash, created_at::text from ${sql.raw(receipts)} order by id`)).rows
    : []
  for (const [index, receipt] of applied.slice(0, files.length).entries()) {
    const file = files[index]!
    if (file.hash === receipt.hash && String(file.folderMillis) === receipt.created_at) continue
    throw new Error(`Refusing to migrate${schema === "drizzle" ? "" : ` ${schema}`}: drizzle/${entries[index]!.tag}.sql is not the migration this database applied. Restore the applied file, or recreate a disposable database.`)
  }
  if (applied.length > files.length) console.log(`${schema === "drizzle" ? "The" : `${schema}: the`} database has applied ${applied.length} migrations and this image carries ${files.length}; applying nothing.`)
  await apply(db, { migrationsFolder: folder, migrationsSchema: schema })
}
