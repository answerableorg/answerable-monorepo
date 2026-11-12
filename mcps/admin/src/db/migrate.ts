import { fileURLToPath } from "node:url"
import { migrate as apply, type Database } from "@answerable/mcp-postgres"

/** The admin MCP's drizzle folder, `mcps/admin/drizzle`: `0000_initial.sql` makes `@answerable/mcp-postgres`'s tables, `0001_evidence_chain.sql` the chain's triggers. */
export const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url))

/** The restricted role the admin MCP serves as: the bootstrap makes it a login, and every migration provisions it with `runtimeGrants`. */
export const runtimeRole = "answerable_admin_runtime"

/** Apply the admin MCP's pending migrations. */
export const migrate = (db: Database): Promise<void> => apply(db, { folder: migrationsFolder })
