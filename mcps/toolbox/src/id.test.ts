import { expect, test } from "bun:test"
import { createFakeId } from "@answerable/id-admin/testing"
import { createToolboxId } from "./id"

test("the Toolbox's client reads ID with a platform:read token, and refuses a write or another service's token before anything is sent", async () => {
  const fake = createFakeId()
  const id = createToolboxId(fake.config)
  expect(await id.get("/audit-events?limit=1")).toMatchObject({ items: [] })
  expect(await id.read("/audit-events?limit=1")).toMatchObject({ body: { items: [] } })
  const organisation = crypto.randomUUID()
  for (const method of ["POST", "PATCH", "PUT", "DELETE", "GET"] as const) {
    await expect(id.manage(method, `/organizations/${organisation}/entitlements`, { body: { scopes: ["e2e"] } })).rejects.toThrow(
      `The Toolbox reads Answerable ID and never writes to it: ${method} /organizations/${organisation}/entitlements was not sent`,
    )
  }
  await expect(id.withToken("https://mcp.test/admin", "toolbox:admin", async () => new Response())).rejects.toThrow(
    "The Toolbox asks Answerable ID for no token but its own platform:read one: none for https://mcp.test/admin was asked",
  )
  expect(fake.scopesAsked).toEqual(["platform:read"])
  expect(fake.received.map(({ request }) => request.split(" ")[0])).toEqual(["GET", "GET"])
})

test("nothing the Toolbox or the platform package runs writes to ID: no manage or withToken call, and the Toolbox's only ID client is createToolboxId's", async () => {
  const root = new URL("../../../", import.meta.url).pathname
  const sources: string[] = []
  for (const dir of ["mcps/toolbox/src", "packages/mcp-platform/src"]) {
    for await (const file of new Bun.Glob("**/*.ts").scan(root + dir)) if (!file.endsWith(".test.ts")) sources.push(`${dir}/${file}`)
  }
  expect(sources).toContain("mcps/toolbox/src/server.ts")
  const offending: string[] = []
  for (const path of sources) {
    const text = await Bun.file(root + path).text()
    if (/\.manage\(|\bwithToken\(/.test(text)) offending.push(`${path}: a write to ID`)
    if (path !== "mcps/toolbox/src/id.ts" && path.startsWith("mcps/") && /\bcreateIdAdmin\(/.test(text)) offending.push(`${path}: an ID client other than createToolboxId's`)
  }
  expect(offending).toEqual([])
})
