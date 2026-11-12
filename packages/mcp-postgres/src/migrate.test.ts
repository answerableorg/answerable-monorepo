import { afterAll, expect, spyOn, test } from "bun:test"
import { appendFile, cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api"
import type { Database } from "./connect"
import { evidenceChainSql, migrate, migrationsFolder } from "./migrate"
import * as schema from "./schema"
import { database } from "./test/database"
import { rowsOf } from "./testing"

const db = database.connect()
afterAll(() => db.$client.end())
const sha256 = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex")
const receipts = (on = db) => rowsOf(on)`select hash, created_at::text as created_at from drizzle.__drizzle_migrations order by id`
const tables = async (on: Database) => (await rowsOf(on)`select table_name from information_schema.tables where table_schema = 'public' order by table_name`).map(row => row.table_name)
test("the migrations apply once, each recorded by the hash of its text and its journal time, and a second run changes nothing", async () => {
  await migrate(db, { folder: migrationsFolder })
  const journal = JSON.parse(await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8")) as { entries: { tag: string; when: number }[] }
  const applied = await receipts()
  expect(applied).toEqual(await Promise.all(journal.entries.map(async entry => ({ hash: sha256(await readFile(join(migrationsFolder, `${entry.tag}.sql`), "utf8")), created_at: String(entry.when) }))))
  await migrate(db, { folder: migrationsFolder })
  expect(await receipts()).toEqual(applied)
  expect(await tables(db)).toEqual(["evidence_events", "evidence_payloads", "intents"])
})

test("the schema matches the committed migrations, whose custom file is the evidence chain's SQL", async () => {
  const folder = new URL("../drizzle/", import.meta.url)
  const journal: { entries: { tag: string }[] } = await Bun.file(new URL("meta/_journal.json", folder)).json()
  expect(journal.entries.map(({ tag }) => tag)).toEqual(["0000_initial", "0001_evidence_chain"])
  expect((await readdir(folder)).filter(name => name.endsWith(".sql")).sort()).toEqual(journal.entries.map(({ tag }) => `${tag}.sql`))
  expect((await readdir(new URL("meta/", folder))).filter(name => name.endsWith("_snapshot.json")).sort()).toEqual(journal.entries.map(({ tag }) => `${tag.split("_")[0]}_snapshot.json`))
  expect((await Bun.file(new URL("meta/0000_snapshot.json", folder)).json()).prevId).toBe("00000000-0000-0000-0000-000000000000")
  // Drizzle names snapshots by the migration number, without the SQL name; a custom migration keeps the snapshot before it.
  const previous = await Bun.file(new URL("meta/0001_snapshot.json", folder)).json()
  expect(await generateMigration(previous, generateDrizzleJson(schema, previous.id)), "Schema drifted from the committed migrations; run `bun run db:generate`").toEqual([])
  expect(await Bun.file(new URL("0001_evidence_chain.sql", folder)).text()).toBe(evidenceChainSql)
})

async function editJournal(folder: string, edit: (entries: { tag: string; when: number }[]) => void) {
  const path = join(folder, "meta/_journal.json")
  const journal = JSON.parse(await readFile(path, "utf8"))
  edit(journal.entries)
  await writeFile(path, JSON.stringify(journal))
}

test.each([
  ["an applied file was edited", "drizzle/0001_evidence_chain.sql", (folder: string) => appendFile(join(folder, "0001_evidence_chain.sql"), "\n-- edited\n")],
  ["an applied file was regenerated with a new journal time", "drizzle/0000_initial.sql", (folder: string) => editJournal(folder, entries => { entries[0]!.when += 1 })],
  ["an applied file was removed from before a later one", "drizzle/0001_evidence_chain.sql", (folder: string) => editJournal(folder, entries => { entries.shift() })],
])("migration refuses, naming the file, when %s", async (_, file, change) => {
  const folder = await mkdtemp(join(tmpdir(), "mcp-postgres-migrations-"))
  try {
    await cp(migrationsFolder, folder, { recursive: true })
    await change(folder)
    const applied = await receipts()
    await expect(migrate(db, { folder })).rejects.toThrow(`Refusing to migrate: ${file} is not the migration this database applied`)
    expect(await receipts()).toEqual(applied)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})

test.each([
  ["the last migration", 1],
  ["every migration", 2],
])("a database that has applied more than the folder carries is left as it is, and the run says so: %s missing", async (_, missing) => {
  const folder = await mkdtemp(join(tmpdir(), "mcp-postgres-migrations-"))
  const log = spyOn(console, "log").mockImplementation(() => {})
  try {
    await cp(migrationsFolder, folder, { recursive: true })
    await editJournal(folder, entries => { entries.splice(entries.length - missing, missing) })
    const applied = await receipts()
    expect(applied).toHaveLength(2)
    await migrate(db, { folder })
    expect(await receipts()).toEqual(applied)
    expect(log.mock.calls).toEqual([[`The database has applied 2 migrations and this image carries ${2 - missing}; applying nothing.`]])
  } finally {
    log.mockRestore()
    await rm(folder, { recursive: true, force: true })
  }
})

test("a database that is ahead still refuses a shared file that changed, and one that agrees says nothing", async () => {
  const folder = await mkdtemp(join(tmpdir(), "mcp-postgres-migrations-"))
  const log = spyOn(console, "log").mockImplementation(() => {})
  try {
    await migrate(db, { folder: migrationsFolder })
    expect(log).not.toHaveBeenCalled()
    await cp(migrationsFolder, folder, { recursive: true })
    await editJournal(folder, entries => { entries.pop() })
    await appendFile(join(folder, "0000_initial.sql"), "\n-- edited\n")
    const applied = await receipts()
    await expect(migrate(db, { folder })).rejects.toThrow("Refusing to migrate: drizzle/0000_initial.sql is not the migration this database applied")
    expect(await receipts()).toEqual(applied)
  } finally {
    log.mockRestore()
    await rm(folder, { recursive: true, force: true })
  }
})

