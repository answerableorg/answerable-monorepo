import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool, type PoolConfig } from "pg"

/** A server's database: drizzle over a `pg` pool, which is `db.$client`; `db.$client.end()` closes it. */
export type Database = NodePgDatabase & { $client: Pool }
/** A database (over a pool or one client), or a transaction on one, as this package's functions take it. */
export type Executor = NodePgDatabase | Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0]
/** What `connect` passes through to `pg.Pool`: everything but the URL and the TLS settings, which come from the URL. */
export type ConnectOptions = Omit<PoolConfig, "connectionString" | "ssl">

/**
 * The bounds of every pool a server serves through, its own database's and the MCPs': at most 10 connections; a borrow that waits 5 seconds for one
 * fails instead of queueing for ever; and a statement, or a transaction left idle, ends 56 seconds in, a second after the longest a tool may run
 * (`@answerable/mcp`'s `maxTimeoutMs`), so a query a timed-out call left behind gives its connection back. Each connection sends them as session
 * settings when it opens, so no role, provisioning or migration changes; a migration connects with options of its own.
 */
export const servingPool = Object.freeze({
  max: 10,
  connectionTimeoutMillis: 5_000,
  // A number, not maxTimeoutMs + 1_000: this package imports @answerable/mcp as types only, so the ops image needs no packages/mcp. A test holds the two together.
  statement_timeout: 56_000,
  idle_in_transaction_session_timeout: 56_000,
}) satisfies ConnectOptions

/**
 * Keep a lost connection from ending the process. `pg` reports one as an `error` event, on the pool for an idle client as well as on the client itself,
 * and an event with no listener throws. The next query takes a new connection. `label` names the package in the log line, which carries the error's class
 * and code and never its message, which can hold credentials.
 */
export function surviveLostConnections(pool: Pool, label = "mcp-postgres"): Pool {
  // The client's own listener has logged it: every client the pool makes emits `connect` before it can be idle.
  pool.on("error", () => {})
  pool.on("connect", client => client.on("error", (error: Error & { code?: string }) => {
    console.error(`[${label}] database connection lost`, { name: error.name, ...(error.code ? { code: error.code } : {}) })
  }))
  return pool
}

/**
 * A drizzle database over a `pg` pool on a Postgres URL, read the way libpq reads it: `sslmode` and `sslrootcert` in the URL make the pool verify the
 * server against that certificate authority, so a deployment's URL ends in `?sslmode=verify-full&sslrootcert=/etc/ssl/db/ca.pem`. A URL naming
 * `sslrootcert` must ask for `sslmode=verify-full` or `verify-ca`, so that the file is never there for show (pg 8 verifies fully under either, and
 * warns once that `verify-ca` will mean less in pg 9). The pool is lazy: nothing connects until the first query, and a lost connection costs a log line and
 * not the process. `options` are the pool's, such as `max`.
 */
export function connect(url: string, options: ConnectOptions = {}): Database {
  const parsed = new URL(url)
  if (parsed.searchParams.has("sslrootcert")) {
    const mode = parsed.searchParams.get("sslmode")
    if (mode !== "verify-full" && mode !== "verify-ca") throw new Error(`sslrootcert needs sslmode=verify-full or sslmode=verify-ca, not ${mode ? `sslmode=${mode}` : "no sslmode"}`)
  }
  return drizzle({ client: surviveLostConnections(new Pool({ ...options, connectionString: url })) })
}
