// What bun mcp dev does for the developer's organisation, in the local ID and the local Toolbox, so that they can sign in to the MCP and call every
// tool of it. Both are local conveniences: in staging and production staff enable an MCP for an organisation and grant it (toolbox_enable,
// standalone_enable and access_grant in the admin MCP).
import { enablementSteps, RowConflict, type Row } from "@answerable/mcp-admin/enablement"
import type { Call } from "../../infra/ops/src/admin-api"
import type { Registrar } from "../../infra/ops/src/registrar"
import { local, type Stack } from "./local"
import type { Fetch } from "./io"
import { all, createRegistrar, machineToken, registerToolbox } from "./local-id"

// Widen the scopes of a capability or an entitlement ID holds at `path` to carry `needed` as well, with If-Match under `<key>-r<revision>`.
async function widen(registrar: Registrar, path: string, key: string, needed: readonly string[]) {
  const held = (await registrar.read(path))!
  await registrar.update(path, key, held, { scopes: [...new Set([...(held.body.scopes as string[]), ...needed])].sort() })
}

/**
 * Give organisation `organization` access to standalone MCP `name`, whose resource and `claude-code-<name>` client are registered: the rows
 * `standalone_enable` makes with `everyone: true`, from the same plan. A capability or an entitlement of the MCP's resource that lacks a scope the MCP
 * gained since is widened first; a row that is not active stops it, naming the row and the command to run again. Safe to repeat. What it did, in words.
 */
export async function giveStandaloneAccess(call: Call, organization: string, name: string, stack: Stack = local) {
  const registrar = createRegistrar(call)
  const resource = `${stack.toolbox}/${name}/mcp`
  const hostClientId = `claude-code-${name}`
  const registered = (await registrar.read(`/resources/${encodeURIComponent(resource)}`))!.body
  const mcpScopes = (registered.allowedScopes as string[]).filter(scope => scope !== "offline_access")
  const capabilities = await all<Row>(call, `/organizations/${organization}/capabilities`)
  const entitlements = await all<Row>(call, `/organizations/${organization}/entitlements?clientId=${encodeURIComponent(hostClientId)}`)
  const lacking = (row: Row) => row.clientId === hostClientId && row.resource === resource && row.status === "active" && mcpScopes.some(scope => !row.scopes.includes(scope))
  for (const [kind, rows] of [["capabilities", capabilities], ["entitlements", entitlements]] as const) {
    for (const row of rows.filter(lacking)) {
      await widen(registrar, `/organizations/${organization}/${kind}/${row.id}`, `${name}-${row.id}`, mcpScopes)
      row.scopes = [...new Set([...row.scopes, ...mcpScopes])].sort()
    }
  }
  const steps = await enablementSteps({
    organizationId: organization, mcp: name, resource, mcpScopes, linked: registered.clients as string[], hostClientIds: [hostClientId], everyone: true,
    capabilities, entitlements: async () => entitlements,
  }).catch((error: unknown) => { throw error instanceof RowConflict ? new Error(`${error.message}, then run bun mcp dev ${name} again`) : error })
  for (const step of steps) await registrar.write(step.method, step.path, crypto.randomUUID(), step.body, { create: true })
  const { made, changed } = registrar.tally
  return made || changed ? `${made} made, ${changed} widened` : "already in place"
}

/** The Toolbox's admin API as a caller reaches it with a `toolbox:admin` token: the status and the JSON body of a call under `/admin/v1`. */
export type ToolboxApi = (method: "GET" | "PUT", path: string, body?: unknown) => Promise<{ status: number; body: unknown }>
type Answered = { items?: { provider_id: string; enabled: boolean; overrides: unknown }[]; error?: { code: string; message: string } }

/**
 * Enable the Toolbox for organisation `organization`, as the admin MCP's toolbox_enable does, from the same plan: in ID, through `call` (which needs
 * `platform:write`), for each of `hostClientIds`, its link to the Toolbox's `resource`, the organisation's sign-in and `toolbox` capabilities and the
 * entitlements for everyone in it; then each of `providers` in the organisation's catalogue, through `toolbox`, keeping an entry's overrides. A row
 * that does not fit stops it, naming the row and `again`, what to do once it is fixed. Safe to repeat. Answers what it made, in ID and in the catalogue.
 */
export async function enableToolbox(call: Call, toolbox: ToolboxApi, { organization, hostClientIds, providers, resource, again }: {
  organization: string; hostClientIds: readonly string[]; providers: readonly string[]; resource: string; again: string
}) {
  const registrar = createRegistrar(call)
  const registered = await registrar.read(`/resources/${encodeURIComponent(resource)}`)
  if (!registered) throw new Error(`Answerable ID has no resource ${resource}: register the Toolbox first`)
  const steps = await enablementSteps({
    organizationId: organization, mcp: "toolbox", resource, mcpScopes: ["toolbox"], linked: registered.body.clients as string[], hostClientIds, everyone: true,
    capabilities: await all<Row>(call, `/organizations/${organization}/capabilities`),
    entitlements: clientId => all<Row>(call, `/organizations/${organization}/entitlements?clientId=${encodeURIComponent(clientId)}`),
  }).catch((error: unknown) => { throw error instanceof RowConflict ? new Error(`${error.message}, then ${again}`) : error })
  for (const step of steps) await registrar.write(step.method, step.path, crypto.randomUUID(), step.body, { create: true })
  const refused = ({ status, body }: { status: number; body: unknown }) => new Error(`the Toolbox answered ${status} ${(body as Answered).error?.code}: ${(body as Answered).error?.message}`)
  const catalogue = await toolbox("GET", `/organisations/${organization}/catalogue`)
  if (catalogue.status !== 200) throw refused(catalogue)
  const enabled: string[] = []
  for (const provider of providers) {
    const entry = (catalogue.body as Answered).items!.find(item => item.provider_id === provider)
    if (entry?.enabled) continue
    const put = await toolbox("PUT", `/organisations/${organization}/catalogue/${provider}`, { enabled: true, ...(entry ? { overrides: entry.overrides } : {}) })
    if (put.status !== 200) throw refused(put)
    enabled.push(provider)
  }
  return { made: steps.map(step => step.what), enabled }
}

/**
 * Enable provider `name` for organisation `organization` in the local Toolbox and grant its grant string, `name`, to everyone in the organisation. The
 * Toolbox's resource is registered again first, so that it allows `scopes`, the grant strings of every MCP the Toolbox's hub serves; then
 * {@link enableToolbox} for `claude-code-toolbox`, as mcp-dev, with its `toolbox:admin` token for the catalogue; then the grant, widening the
 * organisation's entitlement on the Toolbox's resource, which ID keeps one of, or making it. Safe to repeat. What it did, in words.
 */
export async function enableInToolbox(io: { fetch: Fetch }, call: Call, mcpDev: { clientId: string; clientSecret: string }, organization: string, name: string, scopes: readonly string[], stack: Stack = local) {
  const token = await machineToken(io.fetch, mcpDev, stack.toolboxAdminResource, "toolbox:admin", stack)
  if (!token) throw new Error("ID refused mcp-dev a token for the Toolbox's admin API, which needs toolbox:admin: run bun mcp setup again")
  await registerToolbox(createRegistrar(call), scopes, stack)
  const toolbox: ToolboxApi = async (method, path, body) => {
    const response = await io.fetch(`${stack.toolbox}/admin/v1${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    })
    return { status: response.status, body: await response.json() }
  }
  const { made, enabled } = await enableToolbox(call, toolbox, {
    organization, hostClientIds: ["claude-code-toolbox"], providers: [name], resource: stack.toolboxResource, again: `run bun mcp dev ${name} again`,
  })
  const registrar = createRegistrar(call)
  const path = `/organizations/${organization}/entitlements`
  const held = (await all<Row & { clientId: string | null }>(call, `${path}?resource=${encodeURIComponent(stack.toolboxResource)}`)).find(row => !row.clientId && !row.memberId && !row.groupId)
  if (held && held.status !== "active") throw new Error(`Answerable ID holds the organisation's entitlement on the Toolbox (${held.id}) with status ${held.status}; enable it with access_enable in the admin MCP, then run bun mcp dev ${name} again`)
  if (held) await widen(registrar, `${path}/${held.id}`, `${name}-toolbox`, [name])
  else await registrar.write("POST", path, crypto.randomUUID(), { resource: stack.toolboxResource, scopes: [name] }, { create: true })
  return `${made.length + enabled.length} rows made in ID and the catalogue; ${registrar.tally.made + registrar.tally.changed ? `${name} granted to the organisation` : `${name} was granted already`}`
}
