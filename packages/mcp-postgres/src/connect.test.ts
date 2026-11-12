import { afterAll, expect, spyOn, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sql } from "drizzle-orm"
import { maxTimeoutMs } from "@answerable/mcp"
import { Client } from "pg"
import { connect, servingPool } from "./connect"
import { database } from "./test/database"
import { connectionCutter, refusalOf } from "./testing"

// A pg pool connects on the first query, so nothing here opens a connection: a client made from the pool's options shows what pg read from the
// URL, which is what every client of the pool connects with.
const directory = mkdtempSync(join(tmpdir(), "mcp-postgres-connect-"))
const ca = join(directory, "ca.pem")
const pem = "-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----\n"
writeFileSync(ca, pem)
afterAll(() => rmSync(directory, { recursive: true, force: true }))
const base = "postgres://runtime:s3cret@db.example:5432/answerable_toolbox"
type Parameters = { host: string; port: number; database: string; user: string; ssl: boolean | { ca?: string; rejectUnauthorized?: boolean; checkServerIdentity?: unknown } }
const parameters = (db: ReturnType<typeof connect>) => (new Client(db.$client.options) as unknown as { connectionParameters: Parameters }).connectionParameters

test("a URL without sslrootcert reaches pg as it is, with the options", async () => {
  const db = connect(`${base}?sslmode=verify-full`, { max: 2 })
  expect(db.$client.options).toMatchObject({ connectionString: `${base}?sslmode=verify-full`, max: 2 })
  const read = parameters(db)
  expect(read).toMatchObject({ host: "db.example", port: 5432, database: "answerable_toolbox", user: "runtime", ssl: {} })
  expect(read.ssl).not.toHaveProperty("ca")
  await db.$client.end()
})

test("sslrootcert becomes the certificate authority pg verifies the server against, under verify-full or verify-ca", async () => {
  const full = connect(`${base}?sslmode=verify-full&sslrootcert=${ca}`, { max: 1 })
  expect(parameters(full)).toMatchObject({ host: "db.example", ssl: { ca: pem } })
  expect(parameters(full).ssl).not.toHaveProperty("rejectUnauthorized")
  expect(parameters(full).ssl).not.toHaveProperty("checkServerIdentity")
  await full.$client.end()
  // pg 8 verifies fully under verify-ca too, and warns once per process when a client parses the URL, so only the pool is made here.
  const chain = connect(`${base}?sslrootcert=${ca}&sslmode=verify-ca`)
  expect(chain.$client.options.connectionString).toBe(`${base}?sslrootcert=${ca}&sslmode=verify-ca`)
  await chain.$client.end()
})

test("sslrootcert without a verifying sslmode is refused, without the URL in the message", () => {
  for (const mode of ["", "&sslmode=require", "&sslmode=prefer"]) {
    const message = mode ? `sslrootcert needs sslmode=verify-full or sslmode=verify-ca, not ${mode.slice(1)}` : "sslrootcert needs sslmode=verify-full or sslmode=verify-ca, not no sslmode"
    expect(() => connect(`${base}?sslrootcert=${ca}${mode}`)).toThrow(message)
    try {
      connect(`${base}?sslrootcert=${ca}${mode}`)
    } catch (error) {
      expect((error as Error).message).not.toContain("s3cret")
    }
  }
})

// A lost connection reaches the pool as an `error` event with no listener by default, which ends the process: the test run fails if it still does.
async function cutWithLogs(run: (db: ReturnType<typeof connect>, cutter: Awaited<ReturnType<typeof connectionCutter>>, logged: () => unknown[][]) => Promise<void>) {
  const cutter = await connectionCutter(database.url)
  const db = connect(cutter.url, { max: 2 })
  const log = spyOn(console, "error").mockImplementation(() => {})
  try {
    await run(db, cutter, () => log.mock.calls)
  } finally {
    log.mockRestore()
    await db.$client.end()
    cutter.close()
  }
}
const until = async (holds: () => boolean) => {
  for (let wait = 0; wait < 500 && !holds(); wait++) await Bun.sleep(10)
  expect(holds()).toBe(true)
}

test("an idle connection lost with no word from the server costs a log line, and the pool serves the next query", () => cutWithLogs(async (db, cutter, logged) => {
  await db.execute(sql`select 1`)
  expect(db.$client.idleCount).toBe(1)
  cutter.cut()
  await until(() => db.$client.idleCount === 0)
  expect((await db.execute(sql`select 1 as served`)).rows).toEqual([{ served: 1 }])
  expect(logged()).toEqual([["[mcp-postgres] database connection lost", { name: "Error" }]])
}))

test("a connection lost while a transaction holds it fails that transaction's next query alone, and the pool serves the next query", () => cutWithLogs(async (db, cutter, logged) => {
  const client = await db.$client.connect()
  try {
    await client.query("begin")
    cutter.cut()
    await until(() => logged().length > 0)
    await expect(client.query("select 1")).rejects.toThrow()
  } finally {
    client.release()
  }
  expect((await db.execute(sql`select 1 as served`)).rows).toEqual([{ served: 1 }])
  expect(logged()).toEqual([["[mcp-postgres] database connection lost", { name: "Error" }]])
}))

test("the serving bounds reach every connection as session settings: a statement a second past the longest tool, and a transaction left idle as long", async () => {
  const db = connect(database.url, servingPool)
  try {
    expect(db.$client.options).toMatchObject({ max: 10, connectionTimeoutMillis: 5_000 })
    expect((await db.execute(sql`select current_setting('statement_timeout') as statement, current_setting('idle_in_transaction_session_timeout') as idle`)).rows)
      .toEqual([{ statement: `${(maxTimeoutMs + 1_000) / 1000}s`, idle: `${(maxTimeoutMs + 1_000) / 1000}s` }])
  } finally {
    await db.$client.end()
  }
})

test("a statement past the statement timeout is cancelled, and its connection serves the next query at once", async () => {
  // The serving bound shortened, so that the test does not wait the 56 seconds a tool's query may take.
  const db = connect(database.url, { ...servingPool, max: 1, statement_timeout: 200 })
  try {
    const started = performance.now()
    expect(await refusalOf(db.execute(sql`select pg_sleep(5)`))).toBe("canceling statement due to statement timeout")
    expect(performance.now() - started).toBeLessThan(2_000)
    expect((await db.execute(sql`select 1 as served`)).rows).toEqual([{ served: 1 }])
  } finally {
    await db.$client.end()
  }
})

test("with every connection of the serving pool held, the next borrow fails after five seconds instead of queueing for ever, and one released serves it", async () => {
  const db = connect(database.url, servingPool)
  const held = await Promise.all(Array.from({ length: servingPool.max }, () => db.$client.connect()))
  try {
    const started = performance.now()
    await expect(db.$client.query("select 1")).rejects.toThrow("timeout exceeded when trying to connect")
    expect(performance.now() - started).toBeGreaterThanOrEqual(servingPool.connectionTimeoutMillis - 50)
    held.pop()!.release()
    expect((await db.execute(sql`select 1 as served`)).rows).toEqual([{ served: 1 }])
  } finally {
    for (const client of held) client.release()
    await db.$client.end()
  }
}, 15_000)
