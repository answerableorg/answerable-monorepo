import { and, eq, isNull } from "drizzle-orm";
import type { Executor } from "../db/client.ts";
import { withDatabaseScope } from "../db/isolation.ts";
import { oauthClients } from "../db/schema/index.ts";

export type ClientOrigins = { allowed(origin: string): Promise<boolean> };

/**
 * The web origins of the redirect URIs of active public clients (`tokenEndpointAuthMethod: none`). A browser
 * app at one of them may call the token endpoint without credentials: it holds no client secret, and a token
 * still needs a code with its PKCE verifier, or a refresh token. Only platform staff register clients.
 */
export function createClientOrigins(
  db: Executor,
  {
    ttlMs = 60_000,
    now = Date.now,
  }: { ttlMs?: number; now?: () => number } = {},
): ClientOrigins {
  let cached: { origins: ReadonlySet<string>; until: number } | undefined;

  async function load() {
    const rows = await withDatabaseScope(db, { kind: "protocol" }, (tx) =>
      tx
        .select({ redirectUris: oauthClients.redirectUris })
        .from(oauthClients)
        .where(
          and(
            eq(oauthClients.tokenEndpointAuthMethod, "none"),
            eq(oauthClients.disabled, false),
            isNull(oauthClients.deletedAt),
          ),
        ),
    );
    const origins = new Set<string>();
    for (const { redirectUris } of rows)
      for (const uri of redirectUris) {
        const origin = URL.canParse(uri) ? new URL(uri).origin : "null";
        if (origin !== "null") origins.add(origin);
      }
    return origins;
  }

  return {
    async allowed(origin: string) {
      if (!cached || now() >= cached.until)
        cached = { origins: await load(), until: now() + ttlMs };
      return cached.origins.has(origin);
    },
  };
}
