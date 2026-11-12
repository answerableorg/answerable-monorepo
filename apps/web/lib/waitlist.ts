import { findCountry } from "@answerable/countries"
import { isHeadcount } from "./headcounts"
import { EMAIL_PATTERN, MESSAGES, MIN_FILL_MS } from "./waitlist-rules"
import {
  createSheetsClient,
  parseSheetsConfig,
  type SheetsDeps,
} from "./sheets"

export { MESSAGES }

export type WaitlistInput = {
  email: string
  country: string
  /** Required where the form asks for it, the founding cohort's. */
  fullName?: string
  /** Required where the form asks for it, the founding cohort's. */
  business?: { name: string; headcount: string }
  /** The values of the form's two guard fields, `GUARD_FIELDS`. */
  guard: { trap: string; openedAt: string }
}
type WaitlistErrors = Partial<
  Record<
    "email" | "country" | "fullName" | "businessName" | "businessHeadcount",
    string
  >
>

export type WaitlistState =
  | { status: "idle" }
  | { status: "error"; errors?: WaitlistErrors; message?: string }
  | { status: "success"; email: string }

const EMAIL_MAX_LENGTH = 254
const FULL_NAME_MAX_LENGTH = 200
const BUSINESS_NAME_MAX_LENGTH = 200
const ERROR_MESSAGE_LIMIT = 500

export type WaitlistDeps = SheetsDeps & {
  /** Defaults to process.env, read at call time so builds never need it. */
  env?: Record<string, string | undefined>
  log?: Pick<Console, "error" | "info">
}

/**
 * Validates the address and saves it to a Google Sheet. Without configuration
 * it only logs the signup outside production, so the form stays usable in
 * development.
 */
export async function submitWaitlist(
  input: WaitlistInput,
  deps: WaitlistDeps = {},
): Promise<WaitlistState> {
  const env = deps.env ?? process.env
  const log = deps.log ?? console
  const email = input.email.trim().toLowerCase()

  const errors: WaitlistErrors = {}
  if (!email) errors.email = MESSAGES.empty
  else if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    errors.email = MESSAGES.invalid
  }
  const country = findCountry(input.country)
  if (!country) errors.country = MESSAGES.country
  const fullName = input.fullName?.trim()
  if (input.fullName !== undefined) {
    if (!fullName) errors.fullName = MESSAGES.fullName
    else if (fullName.length > FULL_NAME_MAX_LENGTH) {
      errors.fullName = MESSAGES.fullNameLong
    }
  }
  const businessName = input.business?.name.trim()
  if (input.business) {
    if (!businessName) errors.businessName = MESSAGES.businessName
    else if (businessName.length > BUSINESS_NAME_MAX_LENGTH) {
      errors.businessName = MESSAGES.businessNameLong
    }
    if (!isHeadcount(input.business.headcount)) {
      errors.businessHeadcount = MESSAGES.businessHeadcount
    }
  }
  if (Object.keys(errors).length || !country) return { status: "error", errors }

  // Answers as a success does and writes nothing, so a script learns nothing.
  if (automated(input.guard, (deps.now ?? (() => new Date()))())) {
    log.info(line("guard_tripped", {}))
    return { status: "success", email }
  }

  const config = parseSheetsConfig(env)
  if (!config) {
    if (env.NODE_ENV === "production") {
      log.error(line("sheets_not_configured", { email }))
      return { status: "error", message: MESSAGES.failed }
    }
    log.info(line("sheets_not_configured_signup_logged_only", { email }))
    return { status: "success", email }
  }

  try {
    const result = await createSheetsClient(config, deps).upsert({
      email,
      countryCode: country.code,
      countryName: country.name,
      fullName,
      businessName,
      businessHeadcount: input.business?.headcount,
    })
    if (result.headerCreated) log.info(line("sheets_header_created", { email }))
    if (result.columnsAdded.length) {
      log.info(
        line("sheets_header_extended", {
          email,
          columns: result.columnsAdded.join(","),
        }),
      )
    }
    return { status: "success", email }
  } catch (error) {
    log.error(
      line("sheets_failed", {
        email,
        message: describe(error, config.privateKey),
      }),
    )
    return { status: "error", message: MESSAGES.failed }
  }
}

/** A filled trap, or a form not opened, or opened a moment ago or in the future. */
function automated(guard: WaitlistInput["guard"], now: Date): boolean {
  if (guard.trap !== "") return true
  const openedAt = Number(guard.openedAt)
  if (!guard.openedAt.trim() || !Number.isFinite(openedAt)) return true
  return now.getTime() - openedAt < MIN_FILL_MS
}

type LogFields = Record<string, string | number | undefined>

/** One line per event, JSON fields, so any log sink keeps the address. */
function line(event: string, fields: LogFields): string {
  return `[waitlist] ${event} ${JSON.stringify(fields)}`
}

function describe(error: unknown, secret: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replaceAll(secret, "[redacted]").slice(0, ERROR_MESSAGE_LIMIT)
}
