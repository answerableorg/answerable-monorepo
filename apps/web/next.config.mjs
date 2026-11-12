import { fileURLToPath } from "node:url"
import { createMDX } from "fumadocs-mdx/next"

/** @type {import("next").NextConfig} */
const config = {
  poweredByHeader: false,
  // app/global-not-found.tsx: with two root layouts, an unmatched URL has no layout of its own.
  experimental: { globalNotFound: true },
  logging: {
    incomingRequests: {
      ignore: [/^\/api\/oauth-test\/callback(?:\?|$)/],
    },
  },
  // AVIF first, WebP for the rest. The landing page magnifies its studio
  // painting, so that one asks for 85. Past 2048 the widths step closely, so a large
  // screen gets near the width it asks for, up to the studio's full 6,000.
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 85],
    deviceSizes: [
      640, 750, 828, 1080, 1200, 1920, 2048, 2560, 3072, 3840, 4800, 6000,
    ],
  },
  // The repository root, not the nearest lockfile Next infers: a worktree sits
  // inside the main checkout, and Tailwind scans from this root.
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
  // Google's design.md linter reads its spec file beside its own module.
  serverExternalPackages: ["@takumi-rs/core", "@google/design.md"],
  transpilePackages: [
    "@answerable/ui",
    "@answerable/countries",
    "@answerable/design",
  ],
  // The content policy has no script-src: a nonce would make every page dynamic. Nothing frames the site or
  // posts a form elsewhere. The transport policy has no includeSubDomains and no preload: the zone's other
  // hosts are not this app's to bind.
  async headers() {
    const noindex = [
      "/docs/:path*",
      "/docs.md",
      "/design.md",
      "/llms.mdx/:path*",
      "/llms.txt",
      "/llms-full.txt",
      "/api/search",
    ].map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }],
    }))
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
          },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
        ],
      },
      ...noindex,
    ]
  },
  // Pages that moved: when the docs were split into Answerable ID, the MCP kit and the Toolbox, and when the MCP
  // quickstart became "Make an MCP". The landing page was built at /new: a temporary redirect, so that the address
  // can hold the next one.
  async redirects() {
    return [
      { source: "/new", destination: "/", permanent: false },
      ...[
        ["/docs/mcp/quickstart", "/docs/mcp/create"],
        ["/docs/mcp/authoring", "/docs/mcp/tools"],
        ["/docs/mcp/toolbox", "/docs/toolbox"],
        ["/docs/mcp/toolbox-admin", "/docs/toolbox/admin"],
      ].flatMap(([source, destination]) => [
        { source, destination, permanent: true },
        {
          source: `${source}.md`,
          destination: `${destination}.md`,
          permanent: true,
        },
      ]),
    ]
  },
  async rewrites() {
    return [
      {
        source: "/docs/:path*.md",
        destination: "/llms.mdx/docs/:path*",
      },
    ]
  },
}

export default createMDX()(config)
