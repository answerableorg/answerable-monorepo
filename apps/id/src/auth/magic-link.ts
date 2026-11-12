import {
  createHash,
  createHmac,
  hkdfSync,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { magicLink } from "better-auth/plugins/magic-link";

import type { Auth } from "../auth.ts";
import type { Environment } from "../env.ts";

/**
 * How long a link and its code work. Judgement: long enough for a slow gateway or a delayed send,
 * since a mail that arrives dead looks like a fault of the person's. Guessing does not depend on
 * it, since a request gets three tries. No standard sets this for email: NIST SP 800-63B-4 does
 * not allow email as an out-of-band authenticator at all.
 */
export const magicLinkTtlMinutes = 30;

/** The issuer of every account a magic link makes: the trigger that writes the provider row
 * cannot read `BETTER_AUTH_URL`, so it is a constant (drizzle/0003). */
export const magicLinkIssuer = "urn:answerable:magic-link";

/** The owner's decision D3: a mailbox proof earns less than a directory sign-in. */
export const magicLinkSessionLifetimeSeconds = 86_400;
export const magicLinkGrantLifetimeSeconds = 604_800;

/** How many comparisons one request's code gets. */
export const magicLinkCodeAttempts = 3;

/**
 * How long a browser's proof of an address lasts from its newest sign-in. A person on links
 * signs in again whenever their 24-hour session ends and, at the latest, when a 7-day grant
 * needs a new authorisation; each sign-in renews the proof. Thirty days keeps it through a
 * holiday of a few weeks. A longer life costs little: the proof only exempts this browser from
 * the address's daily limit, and lets nobody sign in.
 */
export const magicLinkProofLifetimeSeconds = 30 * 86_400;

/**
 * How many addresses one browser's proof holds: a shared office machine signs in a few people.
 * A new address past this drops the one signed in longest ago, whose browser is then treated as
 * any other until it signs in again. Five entries keep the cookie under 400 bytes.
 */
export const magicLinkProofAddresses = 5;

/** A proof is a few entries; anything far longer is not one, and is not hashed. */
const maxProofLength = 1_024;
const proofEntry = /^([A-Za-z0-9_-]{43})\.(\d{1,12})$/;

const hash = (value: string) =>
  createHash("sha256").update(value).digest("base64url");

/**
 * The row of `verifications` a token names. The plugin writes `magic-link:<stored token>`
 * and keeps that function to itself, so ID's hasher below and this are one rule. A token
 * holds 182 random bits, and the database holds only this.
 */
export const magicLinkIdentifier = (token: string) =>
  `magic-link:${hash(token)}`;

/** The browser's sign-in cookie as `magic_link_requests.browser_hash` holds it. */
export const magicLinkBrowserHash = hash;

/**
 * Better Auth's plugin, for its token and its hashed storage. ID issues through
 * `auth.api.signInMagicLink` and mails the token itself. `disableSignUp` because the
 * plugin's own user has no `status`; ID's native routes stay off the allowlist, since
 * its `verify` consumes a token on a plain GET.
 */
export function magicLinkPlugin() {
  return magicLink({
    disableSignUp: true,
    expiresIn: magicLinkTtlMinutes * 60,
    storeToken: { type: "custom-hasher", hash: async (token) => hash(token) },
    sendMagicLink: ({ token, metadata }) => metadata!.receive(token),
  });
}

/**
 * Store a new token for this address and return it, for the caller to mail. Inside a
 * Better Auth transaction, the row joins it.
 */
export async function issueMagicLinkToken(
  auth: Pick<Auth, "api">,
  email: string,
) {
  let issued: string | undefined;
  await auth.api.signInMagicLink({
    body: {
      email,
      metadata: {
        receive(token: string) {
          issued = token;
        },
      },
    },
    // requireHeaders refuses a call without any; no address is read from them.
    headers: new Headers(),
  });
  return issued!;
}

/** Eight digits, each value equally likely: `randomInt` rejects what would bias it. */
export const newMagicLinkCode = () =>
  String(randomInt(100_000_000)).padStart(8, "0");

/**
 * The keyed hashes of a request, under keys derived from the application secret that
 * writes (its ring's first), each with a label of its own. A database read reveals
 * neither a code, which eight digits would give up to a plain hash at once, nor a client
 * address.
 */
export function magicLinkKeys({
  betterAuthSecret,
  betterAuthSecrets,
}: Pick<Environment, "betterAuthSecret" | "betterAuthSecrets">) {
  const secret = betterAuthSecrets?.[0]?.value ?? betterAuthSecret;
  const key = (label: string) =>
    Buffer.from(hkdfSync("sha256", secret, "", label, 32));
  const code = key("answerable:magic-link:code:v1");
  const client = key("answerable:magic-link:client:v1");
  const address = key("answerable:magic-link:address:v1");
  const proof = key("answerable:magic-link:proof:v1");
  const mac = (of: Buffer, value: string) =>
    createHmac("sha256", of).update(value).digest("base64url");
  const addressHash = (email: string) => mac(address, email);

  /** The live entries of a proof whose MAC holds, and none of anything else. */
  function proofEntries(value: string | null | undefined, now: number) {
    if (!value || value.length > maxProofLength) return [];
    const at = value.lastIndexOf("~");
    const payload = value.slice(0, at);
    const actual = Buffer.from(mac(proof, payload));
    const expected = Buffer.from(value.slice(at + 1));
    if (
      at < 0 ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      return [];
    const entries = payload.split("~").map((entry) => proofEntry.exec(entry));
    if (entries.some((entry) => entry === null)) return [];
    return entries
      .map((entry) => ({ hash: entry![1]!, expires: Number(entry![2]) }))
      .filter(({ expires }) => expires * 1000 > now);
  }

  return {
    /** Bound to the request, so one code gives two different values on two requests. */
    codeHmac: (requestId: string, value: string) =>
      mac(code, `${requestId}:${value}`),
    /** In constant time, so a response's timing says nothing of how much of a guess was right. */
    codeMatches(requestId: string, value: string, stored: string) {
      const actual = Buffer.from(mac(code, `${requestId}:${value}`));
      const expected = Buffer.from(stored);
      return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
      );
    },
    clientHash: (value: string) => mac(client, value),
    /** A normalised address, keyed: what a proof holds and an `address_day` refusal logs. */
    addressHash,
    /**
     * A browser's proof that it completed a sign-in for this address: the value it held, with
     * this address renewed and its expired entries gone, newest first, under a MAC. Only ID can
     * make one, and it names no address. Keyed by the ring's first secret, as a code is, so a
     * rotation that ends in-flight codes ends proofs too.
     */
    prove(held: string | null | undefined, email: string, now = Date.now()) {
      const hash = addressHash(email);
      const entries = [
        {
          hash,
          expires: Math.floor(now / 1000) + magicLinkProofLifetimeSeconds,
        },
        ...proofEntries(held, now).filter((entry) => entry.hash !== hash),
      ]
        .sort((a, b) => b.expires - a.expires)
        .slice(0, magicLinkProofAddresses);
      const payload = entries
        .map((entry) => `${entry.hash}.${entry.expires}`)
        .join("~");
      return `${payload}~${mac(proof, payload)}`;
    },
    /** Whether this value proves a sign-in for this address that has not expired. */
    proves(value: string | null | undefined, email: string, now = Date.now()) {
      const hash = addressHash(email);
      return proofEntries(value, now).some((entry) => entry.hash === hash);
    },
  };
}
