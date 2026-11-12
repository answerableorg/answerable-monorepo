import { createIdAdmin, type IdAdmin, type IdConfig } from "@answerable/id-admin"

/**
 * The Toolbox's client on Answerable ID's admin API: `createIdAdmin`'s reads, `get` and `read`, with a `platform:read` token. Its writes, `manage`,
 * and its tokens for other services, `withToken`, refuse before anything is sent. Every MCP's code runs in the Toolbox's process, so the Toolbox
 * only reads ID, and its machine client, `toolbox-hub`, holds `platform:read` alone; what an organisation needs in ID, the admin MCP makes.
 */
export function createToolboxId(config: IdConfig): IdAdmin {
  const { get, read } = createIdAdmin(config)
  return {
    get,
    read,
    manage: async (method, path) => { throw new Error(`The Toolbox reads Answerable ID and never writes to it: ${method} ${path} was not sent`) },
    withToken: async resource => { throw new Error(`The Toolbox asks Answerable ID for no token but its own platform:read one: none for ${resource} was asked`) },
  }
}
