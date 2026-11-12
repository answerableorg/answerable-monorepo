// Written by bun mcp from each manifest.json of an MCP the Toolbox's hub serves (scripts/mcp/generate.ts). Never edit it by hand.

/** The Toolbox resource's allowed scopes in ID, which the register Job sets: `offline_access`, `toolbox`, `toolbox/approve` and every grant string of its hub. */
export const toolboxScopes: readonly string[] = [
  "e2e",
  "e2e/identity",
  "e2e/identity.get",
  "e2e/records",
  "e2e/records.create",
  "e2e/records.delete",
  "e2e/records.list",
  "e2e/records.show",
  "example",
  "example/notes",
  "example/notes.add",
  "example/notes.list",
  "offline_access",
  "toolbox",
  "toolbox/approve",
]
