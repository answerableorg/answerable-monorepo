import { IdError, type IdAdmin } from "@answerable/id-admin"
import { defineMutation, ToolError } from "@answerable/mcp"
import { z } from "zod"
import { enablementSteps, RowConflict, type Row } from "./enablement"
import { commitWith, errors, invalid, named, noPrecondition, organizationId, precondition, scopes, target, type Writes } from "./writes"

const failure = z.object({ error: z.object({ code: z.string(), message: z.string() }) })
const providerList = z.object({ items: z.array(z.object({ id: z.string(), capabilities: z.array(z.object({ identity: z.string() })) })) })
const catalogueList = z.object({ items: z.array(z.object({ provider_id: z.string(), enabled: z.boolean(), overrides: z.unknown() })) })

/**
 * The Toolbox's platform-tier admin API, which the admin MCP calls to read the Toolbox's providers and to enable them in an organisation's catalogue,
 * with a `toolbox:admin` token that ID issues to the admin MCP's own machine client for the Toolbox's admin resource. `resource` is that resource,
 * `<toolbox origin>/admin` (`ADMIN_TOOLBOX_ADMIN_RESOURCE`); the API lives under it at `/v1`, and the Toolbox's own resource is `<toolbox origin>/mcp`.
 */
export function createToolboxAdmin({ id, resource, fetch = globalThis.fetch }: {
  id: IdAdmin
  resource: string
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}) {
  async function call(method: "GET" | "PUT", path: string, body?: unknown) {
    const url = `${resource}/v1${path}`
    let response: Response
    try {
      response = await id.withToken(resource, "toolbox:admin", token => fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      }))
    } catch (error) {
      console.error("[admin] the Toolbox failed", error)
      // ID refusing the token is a configuration to fix; no answer from either is a moment to wait.
      if (error instanceof IdError && error.status !== 0 && error.status < 500) {
        throw new ToolError("UPSTREAM_REJECTED", error.message, { details: { upstream: { status: error.status, code: error.code ?? null } } })
      }
      throw new ToolError("UPSTREAM_UNAVAILABLE", `The Toolbox at ${resource} did not answer; try again shortly`)
    }
    const json = await response.json().catch(() => undefined)
    if (response.ok) return json
    const said = failure.safeParse(json)
    const code = said.success ? said.data.error.code : null
    const message = `The Toolbox answered ${method} ${url} with ${response.status}${said.success ? ` ${code}: ${said.data.error.message}` : ""}`
    console.error("[admin] the Toolbox failed", message)
    if (response.status >= 500) throw new ToolError("UPSTREAM_UNAVAILABLE", message, { details: { upstream: { status: response.status, code } } })
    throw new ToolError("UPSTREAM_REJECTED", message, { details: { upstream: { status: response.status, code } } })
  }
  return {
    /** The Toolbox's own resource in ID, `<origin>/mcp`: the audience of a person's token, which enabling links each host client to. */
    resource: new URL("/mcp", resource).href,
    /** The providers mounted in the Toolbox's hub, by id, with the identities of their reads and mutations. */
    async providers() {
      return providerList.parse(await call("GET", "/providers")).items
    },
    /** An organisation's catalogue in the Toolbox: each provider it holds an entry for, whether it is enabled, and its overrides. */
    async catalogue(organizationId: string) {
      return catalogueList.parse(await call("GET", `/organisations/${organizationId}/catalogue`)).items
    },
    /** Enable a provider in an organisation's catalogue, keeping the overrides its entry holds. */
    async enable(organizationId: string, provider: string, overrides: unknown) {
      await call("PUT", `/organisations/${organizationId}/catalogue/${provider}`, { enabled: true, ...(overrides === undefined ? {} : { overrides }) })
    },
  }
}
/** The Toolbox's admin API, as the admin MCP calls it. */
export type ToolboxAdmin = ReturnType<typeof createToolboxAdmin>

type Resource = { name: string; allowedScopes: string[] | null; clients: string[] }

/** The grant strings of a provider as the Toolbox lists it: its id, and each domain and capability of its reads and mutations. */
const grantsOf = ({ id, capabilities }: { id: string; capabilities: { identity: string }[] }) => [id, ...capabilities.flatMap(({ identity }) => [identity.split(".")[0]!, identity])]

/** ID's refusal of a create because the row exists: someone made it after the preparation read. */
const existed = (error: unknown) => error instanceof ToolError && (error.details?.upstream as { status?: number; code?: string } | undefined)?.code === "conflict"

/**
 * `toolbox.enable`: for an organisation, the providers named in its Toolbox catalogue, and for each host client named what Answerable ID needs so that
 * its people can sign in to the Toolbox from it: the plan `standalone_enable` makes, for the Toolbox's resource, its `toolbox` scope and everyone in the
 * organisation, made in ID with the admin MCP's own machine client. The Toolbox writes nothing to ID. Without the Toolbox's admin resource configured
 * it stays listed and answers `PRECONDITION_FAILED` saying what to set.
 */
export function toolboxWrites(writes: Writes, toolbox: ToolboxAdmin | undefined) {
  const { calls, role, organisation, fresh } = writes
  const enable = role("admin", defineMutation({
    name: "toolbox.enable", risk: "normal", scopes, errors, effects: ["permission_change", "external_call"],
    description: `Prepare enabling the Toolbox for an organisation: the named providers in its catalogue, and for each named host client what Answerable ID needs so that its people can sign in to the Toolbox from it: the client's link to the Toolbox, the organisation's sign-in and toolbox capabilities for both grant kinds, and the sign-in and toolbox entitlements for everyone in it. ${commitWith} What each person may use still needs access_grant of grant strings. Safe to repeat.`,
    input: z.object({
      organizationId,
      hostClientIds: z.array(z.string().min(1).max(200)).min(1).max(20).describe("The OAuth clients people use the Toolbox from, such as claude-code-toolbox"),
      providers: z.array(z.string().min(1).max(12)).min(1).max(50).describe("The Toolbox providers to enable, such as e2e; the Toolbox lists them"),
    }),
    output: z.object({ created: z.array(z.string()).describe("What the commit made, in Answerable ID and the Toolbox's catalogue"), existing: z.array(z.string()).describe("What it found already in place") }),
    async prepare(input, context) {
      fresh(context.principal)
      if (!toolbox) {
        throw precondition("The admin MCP does not know the Toolbox: set ADMIN_TOOLBOX_ADMIN_RESOURCE to the Toolbox's admin resource, such as http://localhost:47400/admin, and restart it", {
          variable: "ADMIN_TOOLBOX_ADMIN_RESOURCE",
        })
      }
      const { organisation: row, target: version } = await organisation(input.organizationId, context)
      const [hostClientIds, providers] = [[...new Set(input.hostClientIds)].sort(), [...new Set(input.providers)].sort()]
      const mounted = await toolbox.providers()
      const unknown = providers.filter(provider => !mounted.some(item => item.id === provider))
      if (unknown.length) throw invalid("providers", `The Toolbox has no provider ${unknown.join(", ")}; it has ${mounted.map(item => item.id).join(", ")}`)
      for (const clientId of hostClientIds) {
        if (await calls.read(`/clients/${encodeURIComponent(clientId)}`, context) === undefined) throw invalid("hostClientIds", `Answerable ID has no client ${clientId}; register it first`)
      }
      const { resource } = toolbox
      const registered = await calls.versioned<Resource>(`/resources/${encodeURIComponent(resource)}`, context, `Answerable ID has no resource ${resource}: the deploy's register Job registers the Toolbox`)
      // The deploy that ships a provider's MCP allows its grant strings when its register Job runs, after the servers have rolled.
      const lacking = [...new Set(mounted.filter(item => providers.includes(item.id)).flatMap(grantsOf))].filter(scope => !(registered.body.allowedScopes ?? []).includes(scope)).sort()
      if (lacking.length) {
        throw precondition(`${resource} does not allow ${lacking.join(" ")} yet: the register Job of the deploy that ships a provider allows its grant strings once the servers have rolled. Wait for the deploy to finish, then prepare again`, { resource, lacking })
      }
      const plan = (linked: readonly string[], capabilities: readonly Row[], entitlements: (clientId: string) => Promise<readonly Row[]>) => enablementSteps({
        organizationId: row.id, mcp: "toolbox", resource, mcpScopes: ["toolbox"], linked, hostClientIds, everyone: true, capabilities, entitlements,
      })
      const steps = await plan(registered.body.clients, await calls.all<Row>(`/organizations/${row.id}/capabilities`, context),
        clientId => calls.all<Row>(`/organizations/${row.id}/entitlements?clientId=${encodeURIComponent(clientId)}`, context))
        .catch((error: unknown) => { throw error instanceof RowConflict ? precondition(`${error.message}, then prepare again`, error.details) : error })
      // Every row the plan reads for, made or not: those it found are the receipt's existing.
      const making = new Set(steps.map(step => step.what))
      const found = (await plan([], [], async () => [])).map(step => step.what).filter(what => !making.has(what))
      const before = (await toolbox.catalogue(row.id)).filter(item => item.enabled).map(item => item.provider_id).sort()
      return {
        targets: [version, target("resource", resource, registered.body.name, registered.etag)],
        preview: {
          summary: `Enable the Toolbox for organisation ${named(row)}: ${providers.join(", ")}, from ${hostClientIds.join(", ")}`,
          changes: [
            ...steps.map(step => ({ path: step.what, from: null, to: step.body ?? { linked: resource } })),
            { path: `toolbox.catalogue[${row.id}]`, from: before, to: [...new Set([...before, ...providers])].sort() },
          ],
          effects: ["permission_change" as const, "external_call" as const],
          warnings: [
            `Everyone in the organisation may sign in to the Toolbox from ${hostClientIds.join(", ")} once this commits; what each person may use there still needs access_grant of grant strings.`,
            "Not atomic: if Answerable ID or the Toolbox fails part-way, what was made stays; preparing and committing the same request again finishes it, skipping what exists.",
            noPrecondition("creating a capability or an entitlement"),
          ],
        },
        plan: { organizationId: row.id, steps, providers, found },
      }
    },
    // Each ID step under the intent's key and its place, so a retried commit replays; a capability or entitlement someone made meanwhile is found,
    // not made twice. Then each provider the catalogue does not enable yet, with the overrides its entry holds.
    async commit({ intent_id, plan: { organizationId: id, steps, providers, found }, preview }, context) {
      const done = { created: [] as string[], existing: [...found] }
      for (const [index, { what, method, path, body }] of steps.entries()) {
        const made = await calls.write(method, path, { body, key: `${intent_id}.${index}` }, context).then(() => true, (error: unknown) => {
          if (existed(error)) return false
          throw error
        })
        done[made ? "created" : "existing"].push(what)
      }
      const held = new Map((await toolbox!.catalogue(id)).map(item => [item.provider_id, item]))
      for (const provider of providers) {
        const entry = held.get(provider)
        if (!entry?.enabled) await toolbox!.enable(id, provider, entry?.overrides)
        done[entry?.enabled ? "existing" : "created"].push(`catalogue ${provider}`)
      }
      return { results: done, applied_changes: preview.changes, effects_performed: preview.effects }
    },
  }))
  return [enable]
}
