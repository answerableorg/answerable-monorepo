import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createAdminFixture, type AdminFixture } from "../__tests__/admin.ts";
import { oauthClients } from "../db/schema/index.ts";
import { createId } from "../lib/id.ts";
import { createClientOrigins, reportReadFailure } from "./client-origins.ts";

const webOrigin = "https://cloud.example";
const confidentialOrigin = "https://confidential.example";

let fixture: AdminFixture;

beforeEach(async () => {
  fixture = await createAdminFixture(
    {},
    { originChecks: true, restrictedRole: true },
  );
  await fixture.db.insert(oauthClients).values([
    {
      id: createId(),
      clientId: "cloud-web-test",
      name: "Cloud web",
      scopes: ["openid", "offline_access"],
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: [
        `${webOrigin}/oidc-callback.html`,
        "http://127.0.0.1:47811/callback",
        "app.example:/cb",
      ],
      tokenEndpointAuthMethod: "none",
    },
    {
      id: createId(),
      clientId: "confidential-test",
      clientSecret: "x",
      name: "Confidential",
      scopes: ["openid"],
      grantTypes: ["authorization_code"],
      redirectUris: [`${confidentialOrigin}/callback`],
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ]);
});

afterEach(async () => {
  await fixture?.close();
});

const token = (origin: string, body: Record<string, string> = {}) =>
  fixture.app.request("/auth/oauth2/token", {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: "not-a-token",
      client_id: "cloud-web-test",
      ...body,
    }),
  });

const preflight = (origin: string, path = "/auth/oauth2/token") =>
  fixture.app.request(path, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });

test("a token request from the origin of a public client's redirect URI gets that origin, without credentials, with Vary: Origin, also on an error answer", async () => {
  const response = await token(webOrigin);
  expect(response.status).toBe(400);
  expect(response.headers.get("access-control-allow-origin")).toBe(webOrigin);
  expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  expect(response.headers.get("vary")?.toLowerCase()).toContain("origin");
});

test("a preflight from that origin is allowed for POST with Content-Type", async () => {
  const response = await preflight(webOrigin);
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe(webOrigin);
  expect(response.headers.get("access-control-allow-methods")).toContain(
    "POST",
  );
  expect(
    response.headers.get("access-control-allow-headers")?.toLowerCase(),
  ).toContain("content-type");
  expect(response.headers.get("access-control-allow-credentials")).toBeNull();
});

test("only https redirect origins are allowed: not a loopback or other http origin", async () => {
  for (const origin of ["http://127.0.0.1:47811", "http://cloud.example"]) {
    const response = await token(origin);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  }
});

test("a request from a client origin that carries the ID session cookie is refused, with no credentials header", async () => {
  const response = await fixture.app.request("/auth/oauth2/token", {
    method: "POST",
    headers: {
      origin: webOrigin,
      cookie: "better-auth.session_token=anything",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: "x",
      client_id: "cloud-web-test",
    }),
  });
  expect(response.status).toBe(403);
  expect(response.headers.get("access-control-allow-credentials")).toBeNull();
});

test("concurrent requests on a cold or expired cache make one database read", async () => {
  let now = 0;
  let loads = 0;
  const origins = createClientOrigins(fixture.appDb, {
    now: () => now,
    load: async () => {
      loads++;
      await new Promise((r) => setTimeout(r, 10));
      return new Set([webOrigin]);
    },
  });
  await Promise.all(
    Array.from({ length: 20 }, () => origins.allowed(webOrigin)),
  );
  expect(loads).toBe(1);
  now += 60_001;
  await Promise.all(
    Array.from({ length: 20 }, () => origins.allowed(webOrigin)),
  );
  expect(loads).toBe(2);
});

test("a database failure allows no origin, is reported, and is retried after a pause, not on every request", async () => {
  let now = 0;
  let loads = 0;
  const errors: unknown[] = [];
  const origins = createClientOrigins(fixture.appDb, {
    now: () => now,
    onError: (error) => errors.push(error),
    load: async () => {
      loads++;
      if (loads === 1) throw new Error("database unavailable");
      return new Set([webOrigin]);
    },
  });
  expect(await origins.allowed(webOrigin)).toBe(false);
  expect(await origins.allowed(webOrigin)).toBe(false);
  expect(loads).toBe(1);
  expect(errors).toHaveLength(1);
  now += 5_001;
  expect(await origins.allowed(webOrigin)).toBe(true);
});

test("the runtime role reads the public clients' origins under the protocol scope", async () => {
  expect(await createClientOrigins(fixture.appDb).allowed(webOrigin)).toBe(
    true,
  );
});

test("an origin that is no registered client's redirect origin gets no CORS header", async () => {
  for (const origin of [
    "https://example.com",
    "https://cloud.example.evil.example",
    "https://cloud.example:8443",
    "null",
  ]) {
    const response = await token(origin);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(
      (await preflight(origin)).headers.get("access-control-allow-origin"),
    ).toBeNull();
  }
});

test("a confidential client's redirect origin gets no CORS header", async () => {
  const response = await token(confidentialOrigin, {
    client_id: "confidential-test",
  });
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
});

test("a client disabled after its origin was cached loses the header when the cache expires", async () => {
  let now = 1_000_000;
  const origins = createClientOrigins(fixture.appDb, {
    ttlMs: 60_000,
    now: () => now,
  });
  expect(await origins.allowed(webOrigin)).toBe(true);
  await fixture.db
    .update(oauthClients)
    .set({ disabled: true })
    .where(eq(oauthClients.clientId, "cloud-web-test"));
  expect(await origins.allowed(webOrigin)).toBe(true);
  now += 60_001;
  expect(await origins.allowed(webOrigin)).toBe(false);
});

test("a trusted origin gets no CORS grant on any /auth path", async () => {
  for (const response of [
    await token(fixture.trustedOrigin),
    await fixture.app.request("/auth/get-session", {
      headers: { origin: fixture.trustedOrigin },
    }),
  ]) {
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  }
});

test("the authorization, session and sign-in paths get no CORS header for a client origin", async () => {
  for (const path of [
    "/auth/get-session",
    "/auth/oauth2/authorize",
    "/auth/oauth2/revoke",
    "/auth/oauth2/userinfo",
  ]) {
    const response = await fixture.app.request(path, {
      headers: { origin: webOrigin },
    });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(
      (await preflight(webOrigin, path)).headers.get(
        "access-control-allow-origin",
      ),
    ).toBeNull();
  }
});

test("a failed read is logged by its class, never its message", () => {
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    reportReadFailure(new TypeError("password=secret in a query"));
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0]!.join(" ");
    expect(line).toContain("client_origins_read_failed");
    expect(line).toContain("TypeError");
    expect(line).not.toContain("secret");
  } finally {
    log.mockRestore();
  }
});
