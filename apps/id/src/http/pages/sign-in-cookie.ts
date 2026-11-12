import { randomBytes } from "node:crypto";
import { getCookie, setCookie } from "hono/cookie";

import {
  magicLinkKeys,
  magicLinkProofLifetimeSeconds,
  magicLinkTtlMinutes,
} from "../../auth/magic-link.ts";
import type { PageContext } from "./gateway.ts";

/** Thirty-two random bytes, base64url. Anything else is not ID's and is replaced. */
const value = /^[A-Za-z0-9_-]{43}$/;

/** What ties a sign-in to one browser. `__Host-` needs `Secure`, and `Secure` needs https, so
 * a plain http origin, as in local development and the test fixture, drops both, here only. */
function cookieFor(context: PageContext, name = "answerable-sign-in") {
  const secure =
    new URL(context.get("environment").betterAuthUrl).protocol === "https:";
  return { name: secure ? `__Host-${name}` : name, secure };
}

const proofCookie = "answerable-sign-in-proof";

/** The browser's sign-in value, when it holds one of ID's. */
export function readSignInCookie(context: PageContext) {
  const held = getCookie(context, cookieFor(context).name);
  return held !== undefined && value.test(held) ? held : null;
}

/** This browser's value, or a new one for `holdSignInCookie` to give it. */
export const signInCookieValue = (context: PageContext) =>
  readSignInCookie(context) ?? randomBytes(32).toString("base64url");

/**
 * Keep this browser's value and renew it, or give it one. A reload keeps its flow, and the
 * cookie outlives the newest link. `SameSite=Lax` and not `Strict`, or a link opened from a
 * mail client arrives without it, and so does a directory's redirect to the SSO callback, a
 * top-level GET from another site.
 */
export function holdSignInCookie(
  context: PageContext,
  browser = signInCookieValue(context),
) {
  const { name, secure } = cookieFor(context);
  setCookie(context, name, browser, {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "Lax",
    maxAge: magicLinkTtlMinutes * 60,
  });
  return browser;
}

/** The browser's proof of its sign-ins, as it holds it: the job checks it against the address. */
export const readSignInProof = (context: PageContext) =>
  getCookie(context, cookieFor(context, proofCookie).name) ?? null;

/**
 * After a sign-in by link or code: this browser has proved this address, so its own requests
 * for it are never refused because others used up the address's day. The cookie holds no
 * address, only what ID's key made of it, and HttpOnly keeps it from a page's scripts. The
 * sign-in cookie's attributes otherwise: it authorises nothing, so `Strict` would add nothing.
 */
export function holdSignInProof(context: PageContext, email: string) {
  const { name, secure } = cookieFor(context, proofCookie);
  setCookie(
    context,
    name,
    magicLinkKeys(context.get("environment")).prove(
      readSignInProof(context),
      email,
    ),
    {
      path: "/",
      httpOnly: true,
      secure,
      sameSite: "Lax",
      maxAge: magicLinkProofLifetimeSeconds,
    },
  );
}
