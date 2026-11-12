import { expect, test } from "bun:test"
import config from "./next.config.mjs"

const everyRoute = async () => {
  const rule = (await config.headers?.())?.find((r) => r.source === "/:path*")
  return Object.fromEntries(
    rule?.headers.map(({ key, value }) => [key, value]) ?? [],
  )
}

test("every route carries the baseline security headers", async () => {
  expect(await everyRoute()).toEqual({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
    "Strict-Transport-Security": "max-age=63072000",
  })
})

test("the content policy has no script-src, which would need a nonce and make every page dynamic", async () => {
  expect((await everyRoute())["Content-Security-Policy"]).not.toContain(
    "script-src",
  )
})

test("the transport policy does not bind the zone's other hosts", async () => {
  expect((await everyRoute())["Strict-Transport-Security"]).not.toMatch(
    /includeSubDomains|preload/,
  )
})

test("the machine-readable routes stay out of the index", async () => {
  const sources = (await config.headers?.())
    ?.filter((r) => r.headers.some((h) => h.key === "X-Robots-Tag"))
    .map((r) => r.source)
  expect(sources).toContain("/docs/:path*")
  expect(sources).toContain("/llms.txt")
})

test("the framework does not advertise itself", () => {
  expect(config.poweredByHeader).toBe(false)
})
