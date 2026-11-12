import { createIdAdmin } from "@answerable/id-admin"
import { createFakeId } from "@answerable/id-admin/testing"
import { createTestMcp, type TestMcp } from "@answerable/mcp/testing"
import type { Database } from "@answerable/mcp-postgres"
import { createAdminMcp } from "../admin"

/** The admin MCP's resource in the tests: the URL `createTestMcp` serves at, and the audience of every token it signs. */
export const resource = "https://mcp.test/mcp"
/** The Toolbox's admin resource in the tests; its API lives under it at `/v1`. */
export const toolboxResource = "https://toolbox.test/admin"
/** The Toolbox's MCP resource, which entitlements for people name. */
export const toolboxMcp = "https://toolbox.test/mcp"
/** The origin of the MCPs the Toolbox serves alone, in the tests: each standalone MCP is the resource `<origin>/<name>/mcp`. */
export const standaloneOrigin = "https://mcp.test"
export const entraIssuer = "https://login.microsoftonline.com/00000000-0000-0000-0000-00000000000a/v2.0"

/**
 * A fake ID whose machine client, admin-mcp, gets tokens for ID's admin API and, with `toolbox:admin`, for the Toolbox's admin API. It may ask for
 * `platform:read platform:users` as the deploy's register Job lets it, unless `users` is false: a deployment registered before that scope existed.
 */
export const createIdFake = ({ users = true } = {}) => createFakeId({
  clientId: "admin-mcp",
  resources: { "https://id.test/api/admin": ["platform:read", "platform:read platform:write", ...(users ? ["platform:read platform:users"] : [])], [toolboxResource]: ["toolbox:admin"] },
})
export type FakeId = ReturnType<typeof createIdFake>

/**
 * The Toolbox's admin API in memory: it accepts only a token the fake ID issued for its admin resource with `toolbox:admin`, lists two providers,
 * `docs` with `docs/pages.read` and `e2e` with no capability, and keeps each organisation's catalogue, which `PUT` replaces an entry of.
 */
export function createFakeToolbox(id: FakeId) {
  const catalogues = new Map<string, Map<string, { enabled: boolean; overrides: unknown }>>()
  const received: { method: string; path: string; body: unknown }[] = []
  const catalogueOf = (organisation: string) => catalogues.get(organisation) ?? catalogues.set(organisation, new Map()).get(organisation)!
  let down = false
  async function fetch(input: string | URL | Request, init?: RequestInit) {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname.replace(/^\/admin\/v1/, "")
    if (down) return Response.json({ error: { code: "internal_error", message: "The Toolbox failed to answer; its log says why" } }, { status: 500 })
    const token = id.issued(request.headers.get("Authorization")?.slice(7) ?? "")
    if (token?.resource !== toolboxResource || !token.scope.split(" ").includes("toolbox:admin")) {
      return Response.json({ error: { code: "unauthorized", message: `Send a machine client's access token for ${toolboxResource} as Authorization: Bearer` } }, { status: 401 })
    }
    const body = request.method === "PUT" ? await request.json() as { enabled: boolean; overrides?: unknown } : undefined
    received.push({ method: request.method, path, body })
    if (path === "/providers") {
      return Response.json({ items: [{ id: "docs", capabilities: [{ identity: "docs/pages.read" }] }, { id: "e2e", capabilities: [] }].map(provider => ({ ...provider, version: "2026-09-29" })) })
    }
    const catalogue = /^\/organisations\/([^/]+)\/catalogue$/.exec(path)
    if (catalogue) return Response.json({ items: [...catalogueOf(catalogue[1]!)].map(([provider_id, entry]) => ({ provider_id, ...entry })) })
    const entry = /^\/organisations\/([^/]+)\/catalogue\/([^/]+)$/.exec(path)
    if (!entry || !body) return Response.json({ error: { code: "not_found", message: `There is no route ${request.method} ${path}` } }, { status: 404 })
    const written = { enabled: body.enabled, overrides: body.overrides ?? { disabled: [], policy_class: {} } }
    catalogueOf(entry[1]!).set(entry[2]!, written)
    return Response.json({ provider_id: entry[2], ...written })
  }
  return {
    fetch, received,
    outage(value: boolean) { down = value },
    /** Set an organisation's catalogue entry for a provider, as staff do through the catalogue's `PUT`. */
    set(organisation: string, provider: string, entry: { enabled: boolean; overrides: unknown }) { catalogueOf(organisation).set(provider, entry) },
  }
}

/**
 * What ID holds for the tests of the writes: a client organisation, Newco, with its links on, a domain, a group, a member in it and the Toolbox's resource
 * registered with its grant strings; the host client; and in the platform organisation the three role groups, each found by its entitlement on
 * the admin MCP's resource and called anything but its role.
 */
export function seed(id: FakeId) {
  const platform = id.organizationId
  const newco = id.organisation(Bun.randomUUIDv7(), { name: "Newco", slug: "newco", magicLink: { enabled: true, admission: "listed" } })
  id.domain(newco.id, "newco.example")
  const engineers = id.group(newco.id, { slug: "engineers", name: "Engineers" })
  const ada = id.member(newco.id, { email: "ada@newco.example", name: "Ada Lovelace" })
  id.join(engineers.id, ada.id)
  id.resource(toolboxMcp, ["e2e", "e2e/records", "toolbox"])
  id.client("claude-code-toolbox")
  const roleGroup = (role: "team" | "admin" | "owner", name: string) => {
    const group = id.group(platform, { slug: `crew-${role}`, name })
    return { group, entitlement: id.entitlement(platform, { groupId: group.id, resource, scopes: [`answerable-${role}`] }) }
  }
  const roles = { team: roleGroup("team", "Support"), admin: roleGroup("admin", "Operations"), owner: roleGroup("owner", "Founders") }
  /** A member of the platform organisation, in the role groups named, with the access view ID would compute for them. */
  function staffer(email: string, held: ("team" | "admin" | "owner")[] = []) {
    const member = id.member(platform, { email, name: email.split("@")[0] })
    for (const role of held) id.join(roles[role].group.id, member.id)
    id.grant(platform, member.id, held.length ? [{
      kind: "resource", id: resource, scopes: held.map(role => `answerable-${role}`),
      via: held.map(role => ({ entitlementId: roles[role].entitlement.id, principal: "group" as const, groupId: roles[role].group.id })),
    }] : [])
    return member
  }
  return { platform, newco, engineers, ada, roles, staffer }
}

/** The admin MCP in-process on a fake ID whose machine client belongs to the platform organisation, a fake Toolbox, and staff to sign in as. */
export async function createAdmin(db: Database, { freshSeconds = 1800, users = true }: { freshSeconds?: number; users?: boolean } = {}) {
  const id = createIdFake({ users })
  const toolbox = createFakeToolbox(id)
  const platform = id.organizationId
  // Every answer ID's admin API gave, with its Operation-Id; `lose` drops the answer to the next write after ID has acted on it, as a broken connection would.
  const answers: { request: string; status: number; operationId: string | null; replayed: boolean }[] = []
  let losing = false
  const observed = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    const response = await id.config.fetch(request.clone())
    answers.push({ request: `${request.method} ${new URL(request.url).pathname}`, status: response.status, operationId: response.headers.get("Operation-Id"), replayed: response.headers.get("Idempotency-Replayed") === "true" })
    const { pathname } = new URL(request.url)
    if (losing && request.method !== "GET" && !pathname.endsWith("/preview") && pathname.startsWith("/api/admin/v1")) {
      losing = false
      throw new TypeError("The connection closed before the answer arrived")
    }
    return response
  }
  // The directory sign-in time each membership's tokens carry, when a test sets one: the token is signed again with it, as ID would have issued it.
  const signedIn = new Map<string, number | null>()
  async function resign(request: Request) {
    const bearer = request.headers.get("Authorization")?.slice(7)
    const claims = bearer ? JSON.parse(Buffer.from(bearer.split(".")[1]!, "base64url").toString()) : {}
    if (!signedIn.has(claims.membership_id)) return request
    const headers = new Headers(request.headers)
    headers.set("Authorization", `Bearer ${await mcp.issuer.sign({ resource, claims: { ...claims, upstream_auth_time: signedIn.get(claims.membership_id) } })}`)
    return new Request(request, { headers })
  }
  const mcp: TestMcp = await createTestMcp(({ auth }) => {
    const server = createAdminMcp({
      auth, db, id: createIdAdmin({ ...id.config, fetch: observed }), platform, freshSeconds, toolbox: { resource: toolboxResource, fetch: toolbox.fetch }, standaloneOrigin,
    })
    return { fetch: async (request: Request) => server.fetch(await resign(request)) }
  })
  /**
   * A member of the platform organisation whose access view gives the admin MCP's resource `scopes`, as an organisation-wide entitlement and a
   * group's would; `holds` changes them in ID, and `signedInAt` the directory sign-in time their tokens carry (seconds, or null for none).
   * `connect` signs in with a token of the platform organisation for that member.
   */
  function staff(scopes: string[]) {
    const member = id.member(platform, { email: `${crypto.randomUUID().slice(0, 8)}@answerable.test`, name: "Staff member" })
    const group = id.group(platform, { slug: `support-${crypto.randomUUID().slice(0, 8)}` })
    const holds = (held: string[]) => id.grant(platform, member.id, [{
      kind: "resource", id: resource, scopes: held,
      via: [{ entitlementId: crypto.randomUUID(), principal: "organization", groupId: null }, { entitlementId: crypto.randomUUID(), principal: "group", groupId: group.id }],
    }])
    holds(scopes)
    const signedInAt = (time: number | null) => signedIn.set(member.id, time)
    const connect = () => mcp.connect({ organizationId: platform, membershipId: member.id, userId: String(member.userId) })
    return { member, holds, signedInAt, connect }
  }
  /** Sign in as a member of the platform organisation that a test seeded itself. */
  const connectAs = (member: { id: string; userId: unknown }) => mcp.connect({ organizationId: platform, membershipId: member.id, userId: String(member.userId) })
  return { id, platform, mcp, staff, connectAs, answers, lose() { losing = true } }
}
