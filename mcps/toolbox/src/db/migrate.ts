import { fileURLToPath } from "node:url"
import { migrate as apply, runtimeGrants as evidenceGrants, type Database, type Grant } from "@answerable/mcp-postgres"

/** The Toolbox's drizzle folder, `mcps/toolbox/drizzle`: `0000_initial.sql` makes the package's tables and the Toolbox's own, `0001_evidence_chain.sql` the chain's triggers. */
export const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url))

/** The restricted role the Toolbox serves as: the bootstrap makes it a login, and every migration provisions it with `runtimeGrants`. */
export const runtimeRole = "answerable_toolbox_runtime"

/** Apply the Toolbox's pending migrations. */
export const migrate = (db: Database): Promise<void> => apply(db, { folder: migrationsFolder })

/**
 * What the Toolbox's runtime role may do, for `configureRuntimeRole` after every migration: `@answerable/mcp-postgres`'s grants, and on its own
 * tables what the boot's ingest, each request's catalogue read and the admin API's writes need. A provider row is only ever added (its
 * `on conflict` reads the key); capabilities and catalogue rows are added and updated, never deleted; host clients are also removed.
 */
export const runtimeGrants: readonly Grant[] = [
  ...evidenceGrants,
  { table: "providers", privileges: ["select", "insert"] },
  { table: "capabilities", privileges: ["select", "insert", "update"] },
  { table: "organisation_catalogue", privileges: ["select", "insert", "update"] },
  { table: "host_clients", privileges: ["select", "insert", "update", "delete"] },
]
