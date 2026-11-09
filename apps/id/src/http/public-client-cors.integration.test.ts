import { afterEach, beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createAdminFixture, type AdminFixture } from "../__tests__/admin.ts";
import { oauthClients } from "../db/schema/index.ts";
import { createId } from "../lib/id.ts";
import { createClientOrigins } from "./client-origins.ts";

const webOrigin = "https://cloud.example";
const confidentialOrigin = "https://confidential.example";

let fixture: AdminFixture;

beforeEach(async () => {
  fixture = await createAdminFixture();
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

test("the loopback redirect origin of a public client is allowed too", async () => {
  const response = await token("http://127.0.0.1:47811");
  expect(response.headers.get("access-control-allow-origin")).toBe(
    "http://127.0.0.1:47811",
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

test("a trusted origin keeps its credentialed policy on every /auth path", async () => {
  const response = await token(fixture.trustedOrigin);
  expect(response.headers.get("access-control-allow-origin")).toBe(
    fixture.trustedOrigin,
  );
  expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  const session = await fixture.app.request("/auth/get-session", {
    headers: { origin: fixture.trustedOrigin },
  });
  expect(session.headers.get("access-control-allow-credentials")).toBe("true");
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
