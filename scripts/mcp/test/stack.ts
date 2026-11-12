// Test support for bun mcp dev: the local stack in memory. The local ID (the fake of @answerable/id-admin), the Toolbox's health and admin API, and a
// start that records the Toolbox and brings its health up until it is stopped.
import type { Fetch } from "../io"
import { servers } from "./io"
import type { LocalId } from "./id"

/**
 * `fetch` for every address of the local stack and `start` for the Toolbox. It answers `/health` listing `mounted` from the moment it is started
 * until it is stopped or has ended. The Toolbox's admin API keeps each organisation's catalogue, and answers `401` for a token ID did not issue for
 * its admin resource with `toolbox:admin`; each entry put is kept in `enabled`.
 */
export function localStack(id: LocalId, { mounted = ["acme"], end, refuse }: {
  mounted?: string[]
  end?: (command: string[], cwd: string) => number | undefined
  /** The Toolbox's admin API answers every catalogue write with this error. */
  refuse?: { status: number; code: string; message: string }
} = {}) {
  const { start, started } = servers(end)
  const enabled: { organisation: string; provider: string; body: unknown }[] = []
  const catalogues = new Map<string, Map<string, { enabled: boolean; overrides: unknown }>>()
  const catalogueOf = (organisation: string) => catalogues.get(organisation) ?? catalogues.set(organisation, new Map()).get(organisation)!
  const up = () => started.some(server => server.cwd.endsWith("mcps/toolbox") && !server.stopped && !server.ended)
  const fetch: Fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.port === "47300") return id.config.fetch(request)
    if (url.pathname === "/health") {
      if (!up()) throw new TypeError("Unable to connect")
      return Response.json({ status: "ok", databases: {}, providers: mounted })
    }
    const token = id.issued(request.headers.get("Authorization")?.slice(7) ?? "")
    if (token?.resource !== "http://localhost:47400/admin" || !token.scope.split(" ").includes("toolbox:admin")) {
      return Response.json({ error: { code: "unauthorized", message: "A token for the Toolbox's admin resource is required" } }, { status: 401 })
    }
    const listed = /^\/admin\/v1\/organisations\/([^/]+)\/catalogue$/.exec(url.pathname)
    if (listed) return Response.json({ items: [...catalogueOf(listed[1]!)].map(([provider_id, entry]) => ({ provider_id, ...entry })) })
    const [, organisation, provider] = /^\/admin\/v1\/organisations\/([^/]+)\/catalogue\/([^/]+)$/.exec(url.pathname)!
    if (refuse) return Response.json({ error: { code: refuse.code, message: refuse.message } }, { status: refuse.status })
    const body = await request.json() as { enabled: boolean; overrides?: unknown }
    enabled.push({ organisation: organisation!, provider: provider!, body })
    catalogueOf(organisation!).set(provider!, { enabled: body.enabled, overrides: body.overrides ?? { disabled: [], policy_class: {} } })
    return Response.json({ provider_id: provider, enabled: body.enabled })
  }
  return { fetch, start, started, enabled }
}
