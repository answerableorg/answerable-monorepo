# Conclusions: the pre-production audit

Written on 12 November 2026, after the change sets landed on `claude/pre-production-audit` (64 commits over `main` at `9397a9cb`, this record included). Every number below comes from a probe an auditor ran, the coordinator's own re-runs, or a count on the landed tree. What was found and not fixed is in the [register](../../02-plan.md#open-register); what must hold before the first `production/*` tag is in [the runbook](../../../infra/README.md#before-the-first-production-tag).

## What the goal was

The last pass over the whole repository before its first production deploy: ID, the MCP kit, the Toolbox and the admin MCP, `bun mcp`, the deployment and its workflows, and the website. The owner asked what is unnecessary, overly complicated or built on a weak assumption, what can be deleted and what gets simpler once it is gone, in the order delete, simplify, optimise, automate, and for a security audit with no corner cut. It is the fifth pass, after the test audit, the V0 cleanup, the two schema audits, the v0 code audit and the audit of pull request 13; their closed decisions stayed closed unless an auditor brought new evidence.

## How it was done

Six audits in parallel, each with a Postgres of its own: ID's sign-in and protocol surface, ID's admin API and data, the MCP kit, the MCP servers and `bun mcp`, the deployment and CI, and the website with the front-end packages. Each claim carries a probe that was run, or is marked as read only. The coordinator checked the top claims against the code, GitHub's API and the live site's headers, ran the dependency scan, and probed the router advisory against ID's route shape. The owner took four decisions; seven change sets followed, tests first, one finding to a commit, each reviewed before it joined the landing branch.

## Measured result

| | Before (`9397a9cb`) | After |
| --- | --- | --- |
| Advisories `bun audit` reports | 76 (1 critical, 29 high) | 12, all in lint and build tooling |
| Packages in `bun.lock` | 1,343 | 1,110 |
| Files deleted | | 20 |
| Source lines outside tests, docs and generated files | | +1,381 / −1,509 |
| Test lines | | +1,843 / −975 |
| ID suite | 2,450 tests at 100% line and function coverage | 2,482 at 100%, in 601 s, on Better Auth 1.7.22 |
| `mcp:test` | 13 suites | 13 of 13 |
| Acceptance against real ID | | 106 journeys, 0 fail, in 235 s |
| Kind stack | | 150 tests, 0 fail, in 358 s |
| Website | | 338 tests; design 185, emails 43, countries 5 |
| Typecheck and lint | 21 of 21 | 21 of 21, on a clean install |

Nothing Critical was found. Sign-in, the OAuth surface, the admin API and tenant separation held under every probe: of Better Auth's 93 endpoints exactly the 15 allowlisted answer; another organisation's ids in paths, filters, cursors and idempotency keys returned nothing; forged tokens (`alg none`, key confusion, an id token, another audience) were refused everywhere; 720 commits of history hold no credential.

## Unsafe or wrong, now fixed

- **The Toolbox held `platform:write` on ID.** Every MCP's code runs in its process, and it used that authority in one place. The enable operation's writes now go through the admin MCP; `toolbox-hub` is registered with `platform:read` alone and an existing wider grant is narrowed; the Toolbox's ID client refuses a write before sending it, and a test fails on one.
- **A stranger could stop a named person's sign-in by link for a day**, with 50 requests. A browser that has signed in with an address now holds a proof and is mailed past the address's daily limit; the limit still bounds mail from strangers.
- **ID ran Hono 4.13.5**, behind nine security fixes. It runs 4.13.18. The router bypass did not reproduce on ID's routes; the upgrade stands on the advisories.
- **An organisation's own SSO client secret was stored in the clear.** It is stored encrypted with the key that holds the signing keys.
- **Five admin MCP writes that let people in skipped the fresh sign-in** the design states. All ask for it.
- **A name chosen by a customer's directory reached staff agents as plain text**, and was copied into the summary a person confirms. Previews quote it as data, bounded and on one line.
- **A slow tool could hold every connection**: the serving pools had no size, no wait limit and no statement limit. They have all three.
- **Images were signed before staging ran them**, so a commit whose staging run failed could be promoted. They are signed after the smoke test, and production checks the signature names its own commit.
- **The website sent no security header and its sign-up form had no defence.** It sends a baseline set, HSTS included; the form has a trap field and a fill-time check, reads one column instead of the sheet, refuses formula-shaped input and never overwrites a registrant's row.
- Smaller: a `TEST` variable could switch off origin and ingress checks in production; a signed-in person with no grant wrote a permanent audit row per refused request; a disabled person kept a standalone MCP until the token expired; one caller could fill the server's listen streams; a garbage bearer made the server call ID during an outage; staff emails were printed in public Actions logs; the sign-in pages that read the database had no budget; the runbook started the mail domain at DMARC `p=none`; test helpers shipped in the MCP image.

## Deleted

The file-migrator adoption in `mcp-postgres`, the Toolbox and the admin MCP (no deployed database was built by it); five MCP error codes nothing can raise; credentialed CORS on `/auth/*` (no browser code calls ID with credentials); the Toolbox's enable route and its plan; the `shadcn` command-line tool as a dependency of the UI package (nine CSS variants, inlined); four UI components nothing imports; `/oauth-test` and its `jose` dependency; `apps/community-mcp`; a duplicate journey; the lines that described a private repository, a staging gate, `sops` and forwarded headers that do not exist.

## The owner's decisions

1. GitHub's protections for production are the owner's to apply, from the runbook's checklist; no setting was changed by this goal.
2. The Toolbox's authority over ID is narrowed now.
3. A browser that has signed in is exempt from the address's daily limit.
4. A repeat sign-up never overwrites; `/oauth-test` and `apps/community-mcp` go. Not taken: refusing a firm administrator's changes to their own membership; the docs now say a firm administrator is trusted with every membership of their firm.

## Challenged and kept

Better Auth was first left at 1.7.15, because on 1.7.22 the provider ends a refresh family with deletes by client and user that nothing confines to the grant, and four of ID's tests failed. The owner then asked for the latest: ID runs 1.7.22, `native-refresh-family.ts` confines the provider's three deletes to the grant, and a test fails when a replay removes another grant's stored access token. `/health` keeps its detail, because the smoke test reads it (`Q-HEALTH-DETAIL`). The `e2e` and `example` MCPs still ship, by the earlier decision. The design page and its pane, the three root layouts, the decision records and the research notes stay. Every workflow, chart template, Terraform module, script and audit action has a consumer; `knip` was clean before and is clean after.

## Not proved here

- The workflow changes (signing after the smoke test, tokens per step, the `make-admin` log) run for the first time on the next `staging/*` tag.
- The column-only read of the sign-up sheet rests on the library's source and a fake worksheet: one sign-up against the live sheet proves it.
- The proof cookie's `__Host-` attributes were tested in ID's suite, not in the kind stack's browser journey.
- Real Entra and Google callbacks, Cloudflare and Civo themselves, and Postmark were outside every auditor's reach.
