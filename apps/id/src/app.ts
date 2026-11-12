import { capturingRefusedIdentity } from "./auth/refused-identity.ts";
import { createPagesApp, isPagePath } from "./http/pages/index.ts";
import { askMailboxToConnect } from "./http/pages/routes/connect-directory.ts";
import { getIP } from "@better-auth/core/utils/ip";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { describeRoute, openAPIRouteHandler, resolver } from "hono-openapi";
import { z } from "zod";

import type { Auth } from "./auth.ts";
import type { Database } from "./db/client.ts";
import type { Environment } from "./env.ts";
import { createAdminApp } from "./http/admin/index.ts";
import {
  createClientOrigins,
  type ClientOrigins,
} from "./http/client-origins.ts";
import { adminSecuritySchemes, adminTags } from "./http/admin/openapi.ts";
import { isAllowedAuthRoute } from "./http/auth-allowlist.ts";
import type { AppEnvironment } from "./http/context.ts";
import { buildPublicOpenApiDocument } from "./http/openapi.ts";
import { problemHandler } from "./http/problem.ts";
import { logRejectedSignIn } from "./http/signin-rejection.ts";
import { createId } from "./lib/id.ts";
import { limitRequestBody } from "./http/request-limits.ts";
import { publicOAuthMetadata } from "./http/oauth-metadata.ts";
import type { OperationalMetrics } from "./operations/metrics.ts";
import {
  systemTxtResolver,
  type TxtResolver,
} from "./services/domain-verification.ts";
import type { MagicLinkRequests } from "./services/magic-link-requests.ts";

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

const statusSchema = z.object({ status: z.literal("ok") });
const unavailableSchema = z.object({ status: z.literal("unavailable") });

export type AppServices = {
  auth: Auth;
  db: Database;
  environment: Environment;
  metrics?: OperationalMetrics;
  /** Where `POST /login` hands a request for a link, and a directory's refusal asks a mailbox. */
  magicLinks: Pick<MagicLinkRequests, "request" | "connectDirectory">;
  /** How a domain's proof is looked up: the system's resolver unless a test brings its own. */
  txtResolver?: TxtResolver;
  /** The web origins of public clients, for the token endpoint's CORS: the client records unless a test brings its own. */
  clientOrigins?: ClientOrigins;
};

export function createApp(services: AppServices) {
  const app = new Hono<AppEnvironment>();

  app.use("*", async (context, next) => {
    const suppliedRequestId = context.req.header("x-request-id");
    const requestId =
      suppliedRequestId && requestIdPattern.test(suppliedRequestId)
        ? suppliedRequestId
        : createId();

    context.set("environment", services.environment);
    context.set("auth", services.auth);
    context.set("db", services.db);
    context.set("magicLinks", services.magicLinks);
    context.set("txtResolver", services.txtResolver ?? systemTxtResolver);
    context.set("requestId", requestId);
    context.header("x-request-id", requestId);

    const clientIp = getIP(context.req.raw, services.auth.options);
    context.set("clientIp", clientIp);
    if (
      services.environment.nodeEnv === "production" &&
      clientIp === null &&
      (context.req.path.startsWith("/auth/") ||
        context.req.path.startsWith("/api/admin/") ||
        isPagePath(context.req.path))
    ) {
      context.header("Cache-Control", "no-store");
      return context.json({ error: "untrusted_ingress" }, 403);
    }
    const finish = services.metrics?.begin(context.req.path);
    try {
      await next();
    } finally {
      finish?.(context.res.status);
    }
  });

  app.use("*", limitRequestBody);

  // No browser calls ID with credentials from another origin, so no path sends
  // a credentialed CORS grant. The admin API sends no CORS headers; its
  // principal still checks a cookie caller's Origin. A public client's browser
  // app may call the token endpoint from its redirect origin, without credentials.
  const clientOrigins =
    services.clientOrigins ?? createClientOrigins(services.db);
  app.use("/auth/*", async (context, next) => {
    const origin = context.req.header("origin");
    if (
      origin &&
      context.req.path === "/auth/oauth2/token" &&
      (context.req.method === "POST" || context.req.method === "OPTIONS") &&
      !services.environment.trustedOrigins.includes(origin) &&
      (await clientOrigins.allowed(origin))
    )
      return cors({
        origin,
        allowMethods: ["POST"],
        allowHeaders: ["Content-Type"],
      })(context, next);
    return next();
  });

  app.route("/api/admin/v1", createAdminApp(services));
  app.route("/", createPagesApp());

  const discoveryCors = cors({ origin: "*", allowMethods: ["GET", "HEAD"] });
  for (const [path, operationId] of [
    ["/.well-known/openid-configuration", "getOpenIdConfiguration"],
    ["/.well-known/oauth-authorization-server", "getOAuthAuthorizationServer"],
  ] as const) {
    // Discovery is public and independent of Origin. Limit this credential-free
    // policy to reads and their preflights on these two exact paths.
    app.use(path, (context, next) => {
      if (
        context.req.method === "GET" ||
        context.req.method === "HEAD" ||
        context.req.method === "OPTIONS"
      )
        return discoveryCors(context, next);
      return next();
    });
    app.get(
      path,
      describeRoute({
        operationId,
        summary: "Read the public OAuth provider metadata",
        tags: ["Token"],
        responses: {
          200: {
            description:
              "Native issuer, signing keys and supported public endpoints",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), z.unknown())),
              },
            },
          },
        },
      }),
      (context) => publicOAuthMetadata(services.auth, context.req.raw),
    );
  }

  app.get(
    "/healthz",
    describeRoute({
      operationId: "getHealth",
      summary: "Liveness check",
      tags: ["Health"],
      description: "Process liveness check",
      responses: {
        200: {
          description: "The process is alive",
          content: { "application/json": { schema: resolver(statusSchema) } },
        },
      },
    }),
    (context) => context.json({ status: "ok" as const }),
  );

  app.get(
    "/readyz",
    describeRoute({
      operationId: "getReadiness",
      summary: "Readiness check",
      tags: ["Health"],
      description: "PostgreSQL readiness check",
      responses: {
        200: {
          description: "The service is ready",
          content: { "application/json": { schema: resolver(statusSchema) } },
        },
        503: {
          description: "PostgreSQL is unavailable",
          content: {
            "application/json": { schema: resolver(unavailableSchema) },
          },
        },
      },
    }),
    async (context) => {
      try {
        await context.get("db").execute(sql`select 1`);
        return context.json({ status: "ok" as const }, 200);
      } catch {
        return context.json({ status: "unavailable" as const }, 503);
      }
    },
  );

  if (services.environment.openApiEnabled) {
    app.get("/openapi.json", async (context) =>
      context.json(
        await buildPublicOpenApiDocument({
          app,
          auth: context.get("auth"),
          environment: services.environment,
        }),
      ),
    );
    app.get(
      "/api/admin/openapi.json",
      openAPIRouteHandler(app, {
        exclude: [/^(?!\/api\/admin(?:\/|$))/],
        documentation: {
          info: {
            title: "Answerable ID Admin API",
            version: "1.0.0",
            description:
              "Operations serve Answerable staff with a platform scope and, where x-scopes names an organisation scope, an organisation's administrators. The six scopes are platform:read, platform:users, platform:write, org:read, org:users and org:members; org:members reads only an organisation's member and group lists, which org:read also allows. The x-kind extension marks read, write and erase operations; erase requires confirm equal to the target id.",
          },
          components: { securitySchemes: adminSecuritySchemes },
          tags: adminTags,
          servers: [{ url: services.environment.betterAuthUrl }],
        },
      }),
    );
  }

  app.all("/auth/*", async (context) => {
    if (!isAllowedAuthRoute(context.req.method, context.req.path)) {
      return context.notFound();
    }

    const headers = new Headers(context.req.raw.headers);
    headers.set("x-request-id", context.get("requestId"));
    const { response, identity } = await capturingRefusedIdentity(() =>
      context.get("auth").handler(new Request(context.req.raw, { headers })),
    );
    if (identity) {
      const answer = await askMailboxToConnect(context, response, identity);
      if (answer) return answer;
    }
    logRejectedSignIn(context, response);
    // The provider's own response carries none of the headers set on the
    // context, so the request id is copied onto it.
    const answer = new Response(response.body, response);
    answer.headers.set("x-request-id", context.get("requestId"));
    // Transport-level refusals the provider does not decorate must not be cached.
    if (
      context.req.path === "/auth/oauth2/token" &&
      !answer.headers.has("cache-control")
    )
      answer.headers.set("Cache-Control", "no-store");
    return answer;
  });

  app.onError(problemHandler);

  app.notFound((context) => context.json({ error: "not_found" }, 404));

  return app;
}

export type App = ReturnType<typeof createApp>;
