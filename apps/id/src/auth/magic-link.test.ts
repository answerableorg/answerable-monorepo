import { describe, expect, test } from "bun:test";
import { createHash, createHmac, hkdfSync } from "node:crypto";
import { z } from "zod";

import { parseMagicLinkAddress } from "../services/magic-link-admission.ts";
import {
  magicLinkBrowserHash,
  magicLinkIdentifier,
  magicLinkKeys,
  magicLinkPlugin,
  magicLinkProofAddresses,
  magicLinkProofLifetimeSeconds,
  newMagicLinkCode,
} from "./magic-link.ts";

const betterAuthSecret = "a-secret-of-at-least-thirty-two-characters";
const requestId = "01900000-0000-7000-8000-000000000001";

test("the plugin creates no user and keeps a link thirty minutes", () => {
  expect(magicLinkPlugin().options).toMatchObject({
    disableSignUp: true,
    expiresIn: 1_800,
  });
});

describe("the code", () => {
  test("is eight digits, keeps its leading zeros, and spreads evenly over a first digit", () => {
    const counts = new Array<number>(10).fill(0);
    const rounds = 20_000;
    for (let round = 0; round < rounds; round++) {
      const code = newMagicLinkCode();
      expect(code).toMatch(/^\d{8}$/);
      counts[Number(code[0])]!++;
    }
    // Every digit is about a tenth; 1,500 to 2,500 is far outside chance for a fair source.
    for (const count of counts) {
      expect(count).toBeGreaterThan(rounds / 10 - 500);
      expect(count).toBeLessThan(rounds / 10 + 500);
    }
  });
});

describe("the keyed hashes", () => {
  const keys = magicLinkKeys({
    betterAuthSecret,
    betterAuthSecrets: undefined,
  });
  const derive = (secret: string, label: string) =>
    Buffer.from(hkdfSync("sha256", secret, "", label, 32));

  test("the code's HMAC is keyed by a derived key under its label and bound to the request", () => {
    const expected = createHmac(
      "sha256",
      derive(betterAuthSecret, "answerable:magic-link:code:v1"),
    )
      .update(`${requestId}:12345678`)
      .digest("base64url");
    expect(keys.codeHmac(requestId, "12345678")).toBe(expected);
    expect(
      keys.codeHmac("01900000-0000-7000-8000-000000000002", "12345678"),
    ).not.toBe(expected);
    expect(keys.codeHmac(requestId, "12345679")).not.toBe(expected);
    // Never the secret itself as the key.
    expect(keys.codeHmac(requestId, "12345678")).not.toBe(
      createHmac("sha256", betterAuthSecret)
        .update(`${requestId}:12345678`)
        .digest("base64url"),
    );
  });

  test("the client's hash has its own key, so it cannot be compared with a code's", () => {
    const expected = createHmac(
      "sha256",
      derive(betterAuthSecret, "answerable:magic-link:client:v1"),
    )
      .update("203.0.113.7")
      .digest("base64url");
    expect(keys.clientHash("203.0.113.7")).toBe(expected);
    expect(keys.clientHash("203.0.113.8")).not.toBe(expected);
  });

  test("the ring's first secret writes, and the single one otherwise", () => {
    const ring = magicLinkKeys({
      betterAuthSecret,
      betterAuthSecrets: [
        { version: 2, value: "the-active-secret-of-at-least-32-characters" },
        { version: 1, value: "a-retained-secret-of-at-least-32-characters" },
      ],
    });
    expect(ring.codeHmac(requestId, "12345678")).toBe(
      magicLinkKeys({
        betterAuthSecret: "the-active-secret-of-at-least-32-characters",
        betterAuthSecrets: undefined,
      }).codeHmac(requestId, "12345678"),
    );
    expect(ring.codeHmac(requestId, "12345678")).not.toBe(
      keys.codeHmac(requestId, "12345678"),
    );
  });
});

describe("a browser's proof of an address", () => {
  const keys = magicLinkKeys({
    betterAuthSecret,
    betterAuthSecrets: undefined,
  });
  const now = Date.UTC(2026, 10, 12);
  const day = 86_400_000;
  const ada = "ada@contoso.com";
  const grace = "grace@contoso.com";

  test("holds a keyed hash of each address and its expiry, never the address, under a MAC", () => {
    const value = keys.prove(null, ada, now);
    expect(value).not.toContain("ada");
    expect(value).not.toContain("contoso");
    const expected = createHmac(
      "sha256",
      Buffer.from(
        hkdfSync(
          "sha256",
          betterAuthSecret,
          "",
          "answerable:magic-link:address:v1",
          32,
        ),
      ),
    )
      .update(ada)
      .digest("base64url");
    expect(keys.addressHash(ada)).toBe(expected);
    const expires = Math.floor(now / 1000) + magicLinkProofLifetimeSeconds;
    expect(value.startsWith(`${expected}.${expires}~`)).toBe(true);
    // Only characters a cookie carries as they are.
    expect(value).toMatch(/^[A-Za-z0-9_.~-]+$/);
  });

  test("proves its own address until it expires, and no other", () => {
    const value = keys.prove(null, ada, now);
    expect(keys.proves(value, ada, now)).toBe(true);
    expect(keys.proves(value, grace, now)).toBe(false);
    const lifetime = magicLinkProofLifetimeSeconds * 1000;
    expect(keys.proves(value, ada, now + lifetime - 1000)).toBe(true);
    expect(keys.proves(value, ada, now + lifetime)).toBe(false);
  });

  test("lasts thirty days from the newest sign-in", () => {
    expect(magicLinkProofLifetimeSeconds).toBe(30 * 86_400);
    const first = keys.prove(null, ada, now);
    const renewed = keys.prove(first, ada, now + 20 * day);
    expect(keys.proves(renewed, ada, now + 45 * day)).toBe(true);
    // Renewing replaces the entry rather than adding one.
    expect(renewed.split("~")).toHaveLength(2);
  });

  test("a tampered, truncated or foreign value proves nothing", () => {
    const value = keys.prove(null, ada, now);
    const [entry, tag] = value.split("~") as [string, string];
    const [hash, expires] = entry.split(".") as [string, string];
    const later = `${hash}.${Number(expires) + 86_400}`;
    for (const forged of [
      `${later}~${tag}`,
      `${entry}~${tag.slice(1)}`,
      `${entry}~${tag.slice(0, -1)}A`,
      `${keys.prove(null, grace, now).split("~")[0]}~${tag}`,
      entry,
      tag,
      "",
      "~",
      `${entry}~${entry}~${tag}`,
      `x${"~".repeat(2_000)}`,
    ])
      expect(keys.proves(forged, ada, now)).toBe(false);
    expect(keys.proves(null, ada, now)).toBe(false);
    expect(keys.proves(undefined, ada, now)).toBe(false);
    // A true MAC over entries of the wrong shape proves nothing either.
    const proofKey = Buffer.from(
      hkdfSync(
        "sha256",
        betterAuthSecret,
        "",
        "answerable:magic-link:proof:v1",
        32,
      ),
    );
    const signed = (payload: string) =>
      `${payload}~${createHmac("sha256", proofKey).update(payload).digest("base64url")}`;
    expect(keys.proves(signed(entry), ada, now)).toBe(true);
    for (const payload of [
      hash,
      `${hash}.`,
      `${hash}.soon`,
      `${hash}x.${expires}`,
    ])
      expect(keys.proves(signed(payload), ada, now)).toBe(false);
  });

  test("a proof made under a secret the ring no longer leads with proves nothing", () => {
    const retired = magicLinkKeys({
      betterAuthSecret: "a-retired-secret-of-at-least-32-characters",
      betterAuthSecrets: undefined,
    });
    const rotated = magicLinkKeys({
      betterAuthSecret,
      betterAuthSecrets: [
        { version: 2, value: "the-active-secret-of-at-least-32-characters" },
        { version: 1, value: betterAuthSecret },
      ],
    });
    expect(keys.proves(retired.prove(null, ada, now), ada, now)).toBe(false);
    expect(rotated.proves(keys.prove(null, ada, now), ada, now)).toBe(false);
  });

  test(`holds ${magicLinkProofAddresses} addresses, and a new one past that drops the one signed in longest ago`, () => {
    expect(magicLinkProofAddresses).toBe(5);
    const addresses = Array.from(
      { length: magicLinkProofAddresses + 1 },
      (_, index) => `person-${index}@contoso.com`,
    );
    let value: string | null = null;
    addresses.forEach((address, index) => {
      value = keys.prove(value, address, now + index * 1000);
    });
    const at = now + addresses.length * 1000;
    expect(keys.proves(value, addresses[0]!, at)).toBe(false);
    for (const address of addresses.slice(1))
      expect(keys.proves(value, address, at)).toBe(true);
    expect(value!.length).toBeLessThan(400);
  });

  test("a new proof keeps the live entries of the value it replaces and drops the expired", () => {
    const old = keys.prove(null, grace, now);
    const later = now + magicLinkProofLifetimeSeconds * 1000 + day;
    const both = keys.prove(
      keys.prove(null, grace, now + day),
      ada,
      now + 2 * day,
    );
    expect(keys.proves(both, grace, now + 2 * day)).toBe(true);
    expect(keys.proves(both, ada, now + 2 * day)).toBe(true);
    const fresh = keys.prove(old, ada, later);
    expect(keys.proves(fresh, grace, later)).toBe(false);
    expect(fresh.split("~")).toHaveLength(2);
    // A value that is not a proof is replaced, not kept.
    expect(keys.prove("not-a-proof", ada, now)).toBe(
      keys.prove(null, ada, now),
    );
  });
});

describe("the identifier and the browser's hash", () => {
  test("are the SHA-256, the plugin's prefix on the token's", () => {
    const digest = createHash("sha256").update("token").digest("base64url");
    expect(magicLinkIdentifier("token")).toBe(`magic-link:${digest}`);
    expect(magicLinkBrowserHash("token")).toBe(digest);
  });
});

describe("the one parser", () => {
  test("normalises as users.email is held, and names the domain", () => {
    expect(parseMagicLinkAddress("  Person@Firm.Example.COM\n")).toEqual({
      email: "person@firm.example.com",
      domain: "firm.example.com",
    });
    expect(parseMagicLinkAddress("o'neill+tag@firm.example.com")).toEqual({
      email: "o'neill+tag@firm.example.com",
      domain: "firm.example.com",
    });
  });

  test("accepts 254 characters and refuses 255, whatever the pattern would say", () => {
    const domain = "@firm.example.com";
    const at = (length: number) =>
      `${"a".repeat(length - domain.length)}${domain}`;
    expect(parseMagicLinkAddress(at(254))?.email).toBe(at(254));
    expect(parseMagicLinkAddress(at(255))).toBeNull();
    // Refused on length alone, before any pattern and before a trim, in far under a second.
    const started = performance.now();
    expect(parseMagicLinkAddress(`a@${".".repeat(250_000)} b`)).toBeNull();
    expect(performance.now() - started).toBeLessThan(50);
  });

  test.each([
    '"alice"@firm.example.com',
    "alice=tag@firm.example.com",
    "a..b@firm.example.com",
    ".a@firm.example.com",
    "a.@firm.example.com",
    "a@b@firm.example.com",
    "alice@firm.example.com.",
    "alice@firm",
    "alice firm@example.com",
    "alice,bob@example.com",
    "alice@example.com,bob@example.com",
    "Alice <alice@example.com>",
    "pérson@firm.example.com",
    "person@fïrm.example.com",
    "person＠firm.example.com",
    "alice\r\nbcc:x@firm.example.com",
    "",
    " ",
  ])("refuses %p, which the plugin would throw on", (address) => {
    expect(parseMagicLinkAddress(address)).toBeNull();
    expect(z.email().safeParse(address.trim().toLowerCase()).success).toBe(
      false,
    );
  });
});
