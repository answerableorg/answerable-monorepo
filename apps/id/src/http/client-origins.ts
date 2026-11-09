import { and, eq, isNull } from "drizzle-orm";
import type { Executor } from "../db/client.ts";
import { withDatabaseScope } from "../db/isolation.ts";
import { oauthClients } from "../db/schema/index.ts";

export type ClientOrigins = { allowed(origin: string): Promise<boolean> };

/** The https origins of the redirect URIs of active public clients. */
async function readOrigins(db: Executor): Promise<ReadonlySet<string>> {
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
      const url = URL.canParse(uri) ? new URL(uri) : null;
      if (url?.protocol === "https:") origins.add(url.origin);
    }
  return origins;
}

/**
 * The web origins whose browser apps may call the token endpoint without credentials: the https origins of
 * the redirect URIs of active public clients (`tokenEndpointAuthMethod: none`). CORS here is not access
 * control: the token endpoint reads no session cookie, and a token still needs a code with its PKCE verifier,
 * or a refresh token. Only platform staff register clients.
 *
 * One read serves concurrent requests. A failed read allows no origin, is reported, and is retried after
 * `retryMs`, so a database outage costs one read for each pause, not one for each request.
 */
export function createClientOrigins(
  db: Executor,
  {
    ttlMs = 60_000,
    retryMs = 5_000,
    now = Date.now,
    load = () => readOrigins(db),
    onError = (error: unknown) =>
      console.error("client origins: the read of public clients failed", error),
  }: {
    ttlMs?: number;
    retryMs?: number;
    now?: () => number;
    load?: () => Promise<ReadonlySet<string>>;
    onError?: (error: unknown) => void;
  } = {},
): ClientOrigins {
  let cached: { origins: ReadonlySet<string>; until: number } | undefined;
  let reading: Promise<ReadonlySet<string>> | undefined;

  function refresh() {
    reading ??= load()
      .then(
        (origins) => {
          cached = { origins, until: now() + ttlMs };
          return origins;
        },
        (error: unknown) => {
          onError(error);
          const none = new Set<string>();
          cached = { origins: none, until: now() + retryMs };
          return none;
        },
      )
      .finally(() => {
        reading = undefined;
      });
    return reading;
  }

  return {
    async allowed(origin: string) {
      const origins =
        cached && now() < cached.until ? cached.origins : await refresh();
      return origins.has(origin);
    },
  };
}
