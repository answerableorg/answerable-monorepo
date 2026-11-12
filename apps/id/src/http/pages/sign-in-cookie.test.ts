import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { testEnvironment } from "../../__tests__/support.ts";
import type { AppEnvironment } from "../context.ts";
import { magicLinkKeys } from "../../auth/magic-link.ts";
import {
  holdSignInCookie,
  holdSignInProof,
  readSignInCookie,
  readSignInProof,
} from "./sign-in-cookie.ts";

function app(betterAuthUrl: string) {
  const app = new Hono<AppEnvironment>();
  app.use("*", async (context, next) => {
    context.set("environment", testEnvironment({ betterAuthUrl }));
    await next();
  });
  app.post("/hold", (context) => context.text(holdSignInCookie(context)));
  app.get("/read", (context) =>
    context.json({ value: readSignInCookie(context) }),
  );
  app.post("/prove", (context) => {
    holdSignInProof(context, "ada@contoso.com");
    return context.body(null, 204);
  });
  app.get("/proof", (context) =>
    context.json({ value: readSignInProof(context) }),
  );
  return app;
}

const held = "a".repeat(43);

test("on https it is a __Host- cookie: Secure, Path=/, HttpOnly, Lax and thirty minutes", async () => {
  const response = await app("https://id.example.com").request("/hold", {
    method: "POST",
  });
  const value = await response.text();
  expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(Buffer.from(value, "base64url")).toHaveLength(32);
  expect(response.headers.getSetCookie()).toEqual([
    `__Host-answerable-sign-in=${value}; Max-Age=1800; Path=/; HttpOnly; Secure; SameSite=Lax`,
  ]);
});

test("on plain http it drops the prefix and Secure, and nothing else", async () => {
  const response = await app("http://localhost:47300").request("/hold", {
    method: "POST",
  });
  const value = await response.text();
  expect(response.headers.getSetCookie()).toEqual([
    `answerable-sign-in=${value}; Max-Age=1800; Path=/; HttpOnly; SameSite=Lax`,
  ]);
});

test("a well-formed cookie keeps its value and has its thirty minutes renewed", async () => {
  for (const [url, name] of [
    ["https://id.example.com", "__Host-answerable-sign-in"],
    ["http://localhost:47300", "answerable-sign-in"],
  ] as const) {
    const response = await app(url).request("/hold", {
      method: "POST",
      headers: { cookie: `${name}=${held}` },
    });
    expect(await response.text()).toBe(held);
    expect(response.headers.getSetCookie()[0]).toContain(
      `${name}=${held}; Max-Age=1800;`,
    );
  }
});

test("a malformed cookie is replaced and reads as none", async () => {
  for (const malformed of [
    "short",
    `${held}a`,
    `${held.slice(1)}!`,
    `${held.slice(1)}%20`,
  ]) {
    const headers = { cookie: `answerable-sign-in=${malformed}` };
    const service = app("http://localhost:47300");
    const replaced = await service.request("/hold", {
      method: "POST",
      headers,
    });
    expect(await replaced.text()).not.toBe(malformed);
    const read = await service.request("/read", { headers });
    expect(await read.json()).toEqual({ value: null });
  }
});

test("each form reads only its own name", async () => {
  const read = async (url: string, cookie: string) =>
    (await app(url).request("/read", { headers: { cookie } })).json();
  expect(
    await read("https://id.example.com", `__Host-answerable-sign-in=${held}`),
  ).toEqual({ value: held });
  // A subdomain or a plain-http page can set this name, but not __Host-.
  expect(
    await read("https://id.example.com", `answerable-sign-in=${held}`),
  ).toEqual({ value: null });
  expect(
    await read("http://localhost:47300", `answerable-sign-in=${held}`),
  ).toEqual({ value: held });
  expect(await read("http://localhost:47300", "other=1")).toEqual({
    value: null,
  });
});

describe("the proof of a sign-in", () => {
  const keys = magicLinkKeys(testEnvironment());

  test("on https it is a __Host- cookie: Secure, Path=/, HttpOnly, Lax and thirty days", async () => {
    const response = await app("https://id.example.com").request("/prove", {
      method: "POST",
    });
    const [line] = response.headers.getSetCookie();
    expect(line).toMatch(
      /^__Host-answerable-sign-in-proof=[^;]+; Max-Age=2592000; Path=\/; HttpOnly; Secure; SameSite=Lax$/,
    );
    const value = decodeURIComponent(line!.split(";", 1)[0]!.split("=")[1]!);
    expect(keys.proves(value, "ada@contoso.com")).toBe(true);
  });

  test("on plain http it drops the prefix and Secure, and nothing else", async () => {
    const response = await app("http://localhost:47300").request("/prove", {
      method: "POST",
    });
    expect(response.headers.getSetCookie()[0]).toMatch(
      /^answerable-sign-in-proof=[^;]+; Max-Age=2592000; Path=\/; HttpOnly; SameSite=Lax$/,
    );
  });

  test("a new proof adds to the one the browser holds", async () => {
    const held = keys.prove(null, "grace@contoso.com");
    const response = await app("https://id.example.com").request("/prove", {
      method: "POST",
      headers: {
        cookie: `__Host-answerable-sign-in-proof=${encodeURIComponent(held)}`,
      },
    });
    const [line] = response.headers.getSetCookie();
    const value = decodeURIComponent(line!.split(";", 1)[0]!.split("=")[1]!);
    expect(keys.proves(value, "grace@contoso.com")).toBe(true);
    expect(keys.proves(value, "ada@contoso.com")).toBe(true);
  });

  test("each form reads only its own name, and reads the value as it is, unchecked", async () => {
    const read = async (url: string, cookie: string) =>
      (await app(url).request("/proof", { headers: { cookie } })).json();
    expect(
      await read("https://id.example.com", "__Host-answerable-sign-in-proof=x"),
    ).toEqual({ value: "x" });
    expect(
      await read("https://id.example.com", "answerable-sign-in-proof=x"),
    ).toEqual({ value: null });
    expect(
      await read("http://localhost:47300", "answerable-sign-in-proof=x"),
    ).toEqual({ value: "x" });
  });
});
