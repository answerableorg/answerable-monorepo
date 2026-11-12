import { describe, expect, mock, test } from "bun:test"
import { COLUMNS, type SheetsConfig } from "./sheets"
import { fakeWorksheet } from "./test-helpers"
import { MESSAGES, submitWaitlist } from "./waitlist"

const productionEnv = {
  NODE_ENV: "production",
  GOOGLE_SHEETS_ID: "sheet-id",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com",
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\\nTESTKEY\\n-----END PRIVATE KEY-----\\n",
}
const now = new Date("2026-09-09T10:00:00.000Z")
const elapsedMs = 10_000
function harness(
  initial: Parameters<typeof fakeWorksheet>[0] = { headers: [...COLUMNS] },
  env: Record<string, string | undefined> = productionEnv,
) {
  const fake = fakeWorksheet(initial)
  const log = {
    error: mock<(line: string) => void>(() => {}),
    info: mock<(line: string) => void>(() => {}),
  }
  const opened: SheetsConfig[] = []
  const submit = (
    email: string,
    country = "GB",
    business?: { name: string; headcount: string },
    fullName?: string,
    guard = { trap: "", elapsedMs: String(elapsedMs) },
  ) =>
    submitWaitlist(
      { email, country, business, fullName, guard },
      {
        env,
        log,
        openSheet: async (config) => {
          opened.push(config)
          return { sheet: fake.worksheet, timeZone: "UTC" }
        },
        now: () => now,
      },
    )
  const lines = (level: keyof typeof log) =>
    log[level].mock.calls.map((call) => call[0])
  return { ...fake, log, opened, submit, lines }
}
const success = { status: "success", email: "a@b.com" } as const
const acme = { name: "Acme Architects", headcount: "11–50" }
const ada = "Ada Lovelace"
const failed = { status: "error", message: MESSAGES.failed } as const

describe("unit: waitlist", () => {
  test("rejects empty and whitespace-only input before opening the sheet", async () => {
    const h = harness()
    for (const email of ["", "   "])
      expect(await h.submit(email)).toEqual({
        status: "error",
        errors: { email: MESSAGES.empty },
      })
    expect(h.opened).toEqual([])
  })
  test("rejects malformed and overlong addresses before opening the sheet", async () => {
    const h = harness()
    for (const email of ["nope", "a@b", "a b@c.d", `${"a".repeat(250)}@b.com`])
      expect(await h.submit(email)).toEqual({
        status: "error",
        errors: { email: MESSAGES.invalid },
      })
    expect(h.opened).toEqual([])
  })
  test("rejects missing and unknown countries before opening the sheet", async () => {
    const h = harness()
    for (const country of ["", "  ", "ZZ"]) {
      expect(await h.submit("a@b.com", country)).toEqual({
        status: "error",
        errors: { country: MESSAGES.country },
      })
    }
    expect(h.opened).toEqual([])
  })
  test("collects both field errors", async () => {
    const h = harness()
    expect(await h.submit("", "")).toEqual({
      status: "error",
      errors: { email: MESSAGES.empty, country: MESSAGES.country },
    })
    expect(h.opened).toEqual([])
  })
  test("requires both business fields where the form asks for them", async () => {
    const h = harness()
    expect(
      await h.submit("a@b.com", "GB", { name: "  ", headcount: "" }),
    ).toEqual({
      status: "error",
      errors: {
        businessName: MESSAGES.businessName,
        businessHeadcount: MESSAGES.businessHeadcount,
      },
    })
    expect(h.opened).toEqual([])
  })
  test("requires the full name where the form asks for it", async () => {
    const h = harness()
    for (const fullName of ["", "  "]) {
      expect(await h.submit("a@b.com", "GB", acme, fullName)).toEqual({
        status: "error",
        errors: { fullName: MESSAGES.fullName },
      })
    }
    expect(h.opened).toEqual([])
  })
  test("collects every error of the founding cohort's form", async () => {
    const h = harness()
    expect(await h.submit("", "", { name: "", headcount: "" }, "")).toEqual({
      status: "error",
      errors: {
        email: MESSAGES.empty,
        country: MESSAGES.country,
        fullName: MESSAGES.fullName,
        businessName: MESSAGES.businessName,
        businessHeadcount: MESSAGES.businessHeadcount,
      },
    })
    expect(h.opened).toEqual([])
  })
  test("takes a 200-character full name and rejects 201", async () => {
    const h = harness()
    expect(await h.submit("a@b.com", "GB", acme, "x".repeat(201))).toEqual({
      status: "error",
      errors: { fullName: MESSAGES.fullNameLong },
    })
    expect(h.opened).toEqual([])
    expect(await h.submit("a@b.com", "GB", acme, "x".repeat(200))).toEqual(
      success,
    )
  })
  test("stores the trimmed full name", async () => {
    const h = harness()
    expect(await h.submit("a@b.com", "GB", acme, "  Ada Lovelace ")).toEqual(
      success,
    )
    expect(h.rows[0].full_name).toBe(ada)
    expect(h.rows[0].business_name).toBe("Acme Architects")
  })
  test("a signup that does not ask keeps the full name", async () => {
    const h = harness()
    await h.submit("a@b.com", "GB", acme, ada)
    expect(await h.submit("a@b.com", "FR")).toEqual(success)
    expect(h.rows[0].country_code).toBe("GB")
    expect(h.rows[0].full_name).toBe(ada)
  })
  test("rejects a headcount outside the bands", async () => {
    const h = harness()
    for (const headcount of ["12", "1-10", "=1+1"]) {
      expect(await h.submit("a@b.com", "GB", { ...acme, headcount })).toEqual({
        status: "error",
        errors: { businessHeadcount: MESSAGES.businessHeadcount },
      })
    }
    expect(h.opened).toEqual([])
  })
  test("takes a 200-character business name and rejects 201", async () => {
    const h = harness()
    expect(
      await h.submit("a@b.com", "GB", { ...acme, name: "x".repeat(201) }),
    ).toEqual({
      status: "error",
      errors: { businessName: MESSAGES.businessNameLong },
    })
    expect(h.opened).toEqual([])
    expect(
      await h.submit("a@b.com", "GB", { ...acme, name: "x".repeat(200) }),
    ).toEqual(success)
  })
  test("stores the trimmed business name and the band", async () => {
    const h = harness()
    expect(
      await h.submit("a@b.com", "GB", { ...acme, name: "  Acme Architects " }),
    ).toEqual(success)
    expect(h.rows[0].business_name).toBe("Acme Architects")
    expect(h.rows[0].business_headcount).toBe("11–50")
  })
  test("a signup that does not ask keeps the business cells", async () => {
    const h = harness()
    await h.submit("a@b.com", "GB", acme)
    expect(await h.submit("a@b.com", "FR")).toEqual(success)
    expect(h.rows[0].country_code).toBe("GB")
    expect(h.rows[0].business_name).toBe("Acme Architects")
    expect(h.rows[0].business_headcount).toBe("11–50")
  })
  describe("values a spreadsheet would run as a formula", () => {
    for (const lead of ["=", "+", "-", "@", "\t=", "\r+"]) {
      test(`refuses an address that starts with ${JSON.stringify(lead)}`, async () => {
        const h = harness()
        expect(await h.submit(`${lead}1+1@x.co`)).toEqual({
          status: "error",
          errors: { email: MESSAGES.invalid },
        })
        expect(h.opened).toEqual([])
      })
    }
    test("takes an address with those characters after its first", async () => {
      const h = harness()
      expect(await h.submit("a=b+c-d@x.co")).toEqual({
        status: "success",
        email: "a=b+c-d@x.co",
      })
    })
    for (const lead of ["=", "+", "-", "@", "\t", "\r", "=+ -@"]) {
      test(`strips a leading ${JSON.stringify(lead)} from the full name and the business name`, async () => {
        const h = harness()
        await h.submit(
          "a@b.com",
          "GB",
          { name: `${lead}Acme-Plus`, headcount: "11–50" },
          `${lead}Ada +Lovelace`,
        )
        expect(h.rows[0].full_name).toBe("Ada +Lovelace")
        expect(h.rows[0].business_name).toBe("Acme-Plus")
      })
    }
    test("asks again for a name that is nothing but those characters", async () => {
      const h = harness()
      expect(
        await h.submit(
          "a@b.com",
          "GB",
          { name: "=+-@", headcount: "11–50" },
          "-@",
        ),
      ).toEqual({
        status: "error",
        errors: {
          fullName: MESSAGES.fullName,
          businessName: MESSAGES.businessName,
        },
      })
      expect(h.opened).toEqual([])
    })
  })
  test("no production log line holds the address, only a hash of it", async () => {
    const address = "person@firm.example"
    const failing = harness({ fail: { loadHeaderRow: new Error("boom") } })
    await failing.submit(address)
    const unconfigured = harness(undefined, { NODE_ENV: "production" })
    await unconfigured.submit(address)
    const created = harness({})
    await created.submit(address)
    const lines = [
      ...failing.lines("error"),
      ...unconfigured.lines("error"),
      ...created.lines("info"),
    ]
    expect(lines).toHaveLength(3)
    for (const logged of lines) {
      expect(logged).not.toContain("person")
      expect(logged).not.toContain("firm.example")
      expect(logged).toMatch(/"emailHash":"[0-9a-f]{12}"/)
    }
    expect(
      new Set(lines.map((l) => /"emailHash":"(\w+)"/.exec(l)?.[1])).size,
    ).toBe(1)
  })
  test("never logs the business name or the full name", async () => {
    const h = harness({ fail: { loadHeaderRow: new Error("boom") } })
    expect(await h.submit("a@b.com", "GB", acme, ada)).toEqual(failed)
    expect(h.lines("error").join()).not.toContain("Acme")
    expect(h.lines("error").join()).not.toContain("Ada")
    const quiet = harness(undefined, { NODE_ENV: "development" })
    expect(await quiet.submit("a@b.com", "GB", acme, ada)).toEqual(success)
    expect(quiet.lines("info").join()).not.toContain("Ada")
  })
  test("normalises the country and stores its name", async () => {
    const h = harness()
    expect(await h.submit("a@b.com", " gb ")).toEqual(success)
    expect(h.rows[0].country_code).toBe("GB")
    expect(h.rows[0].country_name).toBe("United Kingdom")
  })
  test("logs header extension", async () => {
    const h = harness({
      headers: ["email", "first_seen_at", "last_seen_at", "contacted"],
    })
    expect(await h.submit("a@b.com")).toEqual(success)
    expect(h.lines("info")).toEqual([
      '[waitlist] sheets_header_extended {"emailHash":"fb98d44ad750","columns":"country_code,country_name,business_name,business_headcount,full_name"}',
    ])
  })
  test("stores trimmed lowercase addresses", async () => {
    const h = harness()
    expect(await h.submit("  Foo@Example.COM ")).toEqual({
      status: "success",
      email: "foo@example.com",
    })
    expect(h.rows[0].email).toBe("foo@example.com")
  })
  test("logs and succeeds unconfigured outside production", async () => {
    const h = harness(undefined, { NODE_ENV: "development" })
    expect(await h.submit("a@b.com")).toEqual(success)
    expect(h.lines("info")).toEqual([
      '[waitlist] sheets_not_configured_signup_logged_only {"email":"a@b.com"}',
    ])
    expect(h.log.error).not.toHaveBeenCalled()
    expect(h.opened).toEqual([])
  })
  test("fails unconfigured in production", async () => {
    const h = harness(undefined, { NODE_ENV: "production" })
    expect(await h.submit("a@b.com")).toEqual(failed)
    expect(h.lines("error")).toEqual([
      '[waitlist] sheets_not_configured {"emailHash":"fb98d44ad750"}',
    ])
    expect(h.log.info).not.toHaveBeenCalled()
    expect(h.opened).toEqual([])
  })
  test("treats partial config as unconfigured", async () => {
    const h = harness(undefined, {
      NODE_ENV: "production",
      GOOGLE_SHEETS_ID: "sheet-id",
    })
    expect(await h.submit("a@b.com")).toEqual(failed)
    expect(h.lines("error")).toEqual([
      '[waitlist] sheets_not_configured {"emailHash":"fb98d44ad750"}',
    ])
    expect(h.opened).toEqual([])
  })
  test("inserts successfully without logging", async () => {
    const h = harness()
    expect(await h.submit("a@b.com")).toEqual(success)
    expect(h.rows).toHaveLength(1)
    expect(h.log.error).not.toHaveBeenCalled()
    expect(h.log.info).not.toHaveBeenCalled()
  })
  test("logs header creation on first use", async () => {
    const h = harness({})
    expect(await h.submit("a@b.com")).toEqual(success)
    expect(h.lines("info")).toEqual([
      '[waitlist] sheets_header_created {"emailHash":"fb98d44ad750"}',
    ])
    expect(h.log.error).not.toHaveBeenCalled()
  })
  describe("the guard", () => {
    const tripped = [
      [
        "a filled trap",
        { trap: "http://spam.example", elapsedMs: String(elapsedMs) },
      ],
      ["a form sent a moment after it opened", { trap: "", elapsedMs: "2999" }],
      ["a form that took no time at all", { trap: "", elapsedMs: "0" }],
      ["a negative time", { trap: "", elapsedMs: "-5000" }],
    ] as const
    for (const [name, guard] of tripped) {
      test(`answers as a success and writes nothing for ${name}`, async () => {
        const h = harness()
        expect(
          await h.submit("a@b.com", "GB", acme, ada, { ...guard }),
        ).toEqual(success)
        expect(h.opened).toEqual([])
        expect(h.rows).toEqual([])
        expect(h.lines("info")).toEqual(["[waitlist] guard_tripped {}"])
        expect(h.log.error).not.toHaveBeenCalled()
      })
    }
    const accepted = [
      ["no elapsed time", { trap: "", elapsedMs: "" }],
      ["a blank elapsed time", { trap: "", elapsedMs: "  " }],
      ["an elapsed time that is not a number", { trap: "", elapsedMs: "soon" }],
      [
        "an elapsed time that is not finite",
        { trap: "", elapsedMs: "Infinity" },
      ],
      ["exactly the minimum time", { trap: "", elapsedMs: "3000" }],
    ] as const
    for (const [name, guard] of accepted) {
      test(`writes the row for ${name}, as the trap is empty`, async () => {
        const h = harness()
        expect(
          await h.submit("a@b.com", "GB", acme, ada, { ...guard }),
        ).toEqual(success)
        expect(h.rows).toHaveLength(1)
      })
    }
    test("answers as a success when the sheet is not configured, too", async () => {
      const h = harness(undefined, { NODE_ENV: "production" })
      expect(
        await h.submit("a@b.com", "GB", acme, ada, {
          trap: "x",
          elapsedMs: "",
        }),
      ).toEqual(success)
      expect(h.log.error).not.toHaveBeenCalled()
    })
    test("still reports an invalid form as one, so a script learns nothing it could not see", async () => {
      const h = harness()
      expect(
        await h.submit("nope", "GB", acme, ada, { trap: "x", elapsedMs: "" }),
      ).toEqual({ status: "error", errors: { email: MESSAGES.invalid } })
    })
  })
  test("repeated submissions succeed and leave one row", async () => {
    const h = harness()
    expect(await h.submit("a@b.com")).toEqual(success)
    expect(await h.submit("a@b.com")).toEqual(success)
    expect(h.rows).toHaveLength(1)
    expect(h.calls.addRow).toHaveLength(1)
    expect(h.calls.saveUpdatedCells).toHaveLength(1)
  })
  test("logs worksheet failures and returns the generic message", async () => {
    const h = harness({
      fail: {
        loadHeaderRow: new Error(
          "Google API error - [403] The caller does not have permission",
        ),
      },
    })
    expect(await h.submit("a@b.com")).toEqual(failed)
    expect(h.lines("error")).toEqual([
      '[waitlist] sheets_failed {"emailHash":"fb98d44ad750","message":"Google API error - [403] The caller does not have permission"}',
    ])
  })
  test("truncates logged error messages to 500 characters", async () => {
    const h = harness({ fail: { loadHeaderRow: new Error("x".repeat(700)) } })
    expect(await h.submit("a@b.com")).toEqual(failed)
    expect(h.lines("error")).toEqual([
      `[waitlist] sheets_failed ${JSON.stringify({ emailHash: "fb98d44ad750", message: "x".repeat(500) })}`,
    ])
  })
  test("redacts every private key occurrence before truncating", async () => {
    const key = productionEnv.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(
      /\\n/g,
      "\n",
    )
    const h = harness({
      fail: { loadHeaderRow: new Error(`before ${key} middle ${key} after`) },
    })
    expect(await h.submit("a@b.com")).toEqual(failed)
    expect(h.lines("error")).toEqual([
      '[waitlist] sheets_failed {"emailHash":"fb98d44ad750","message":"before [redacted] middle [redacted] after"}',
    ])
    expect(h.lines("error").join()).not.toContain("TESTKEY")
    expect(h.opened[0].privateKey).toBe(key)
  })
  test("logs non-Error throws", async () => {
    const h = harness({ fail: { loadHeaderRow: "boom" } })
    expect(await h.submit("a@b.com")).toEqual(failed)
    expect(h.lines("error")).toEqual([
      '[waitlist] sheets_failed {"emailHash":"fb98d44ad750","message":"boom"}',
    ])
  })
})
