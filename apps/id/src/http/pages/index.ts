import path from "node:path";
import { Hono } from "hono";
import { jsx, type Child } from "hono/jsx";
import { jsxRenderer } from "hono/jsx-renderer";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnvironment } from "../context.ts";
import fontPath from "./fonts/PublicSans-Variable.woff2" with { type: "file" };
import { createClientBudget } from "../../lib/client-budget.ts";
import { describeError } from "./error-copy.ts";
import { Document } from "./views/layout.tsx";
import { ErrorView } from "./views/error.tsx";
import { registerLogin } from "./routes/login.ts";
import { registerConnectDirectory } from "./routes/connect-directory.ts";
import { registerMagicLink } from "./routes/magic-link.ts";
import { registerOAuth } from "./routes/oauth.ts";
import { registerSecurity } from "./routes/security.ts";
import { registerError } from "./routes/error.ts";

declare module "hono" {
  interface ContextRenderer {
    (
      content: Child,
      props: { title: string; footer?: Child },
    ): Response | Promise<Response>;
  }
}
const pages = [
  "/login",
  "/magic-link",
  "/magic-link/code",
  "/connect-directory",
  "/sign-out",
  "/authorize",
  "/consent",
  "/error",
  "/security",
  "/security/verify",
  "/security/link",
];
const assets = ["/assets/tailwind.css", "/assets/fonts/public-sans.woff2"];
export function isPagePath(path: string): boolean {
  return pages.includes(path) || assets.includes(path);
}
export function createPagesApp(): Hono<AppEnvironment> {
  const app = new Hono<AppEnvironment>();
  const headers = secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      styleSrc: ["'self'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
    },
    // OAuth clients may run this flow in a popup that needs window.opener.
    crossOriginOpenerPolicy: false,
    // Under no-referrer, browsers send Origin: null on form posts, which
    // Better Auth refuses whenever the request carries a cookie.
    referrerPolicy: "same-origin",
    xFrameOptions: "DENY",
  });
  for (const route of [...pages, ...assets]) app.use(route, headers);
  for (const route of pages) {
    app.use(route, async (context, next) => {
      context.header("Cache-Control", "no-store");
      await next();
    });
    app.use(route, jsxRenderer(Document, { docType: true }));
  }
  // Judgement, as for `POST /login` (routes/login.ts), whose budget is its own. An office reaches
  // these pages through one egress address, and each sign-in there takes one or two of them (the
  // link or code page and its post, a directory connection, an error page), so a firm's peak is
  // about the rate it posts to /login. Each runs a database statement: without this one client
  // could hold the pool's connections. Nothing else limits these paths.
  const budget = createClientBudget({ max: 300, windowMs: 10_000 });
  for (const [method, route] of [
    ["GET", "/magic-link"],
    ["POST", "/magic-link"],
    ["POST", "/magic-link/code"],
    ["GET", "/connect-directory"],
    ["POST", "/connect-directory"],
    ["GET", "/error"],
  ] as const)
    app.on(method, route, async (context, next) => {
      if (budget.take(context.get("clientIp") ?? "unresolved")) return next();
      context.status(429);
      context.header("Retry-After", "10");
      return context.render(
        jsx(ErrorView, {
          description: describeError("sign_in_rate_limited"),
          details: null,
        }),
        { title: "Can't sign in" },
      );
    });
  // scripts/build-css.ts writes the compiled stylesheet next to this module:
  // beside the bundle in dist/, beside the source for dev and tests. The
  // service never compiles it, so a deployment needs no node_modules.
  const stylesheet = path.join(import.meta.dir, "tailwind.css");
  app.get(
    "/assets/tailwind.css",
    () =>
      new Response(Bun.file(stylesheet), {
        headers: {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      }),
  );
  app.get("/assets/fonts/public-sans.woff2", () => {
    return new Response(Bun.file(new URL(fontPath, import.meta.url)), {
      headers: {
        "Content-Type": "font/woff2",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });
  registerLogin(app);
  registerMagicLink(app);
  registerConnectDirectory(app);
  registerOAuth(app);
  registerSecurity(app);
  registerError(app);
  return app;
}
