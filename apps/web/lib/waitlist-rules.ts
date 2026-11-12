/**
 * What the waitlist accepts and what it says when it does not, shared by the
 * server and the founding cohort form, which checks the address before its
 * second step. No server imports, so the browser can load it.
 */
export const MESSAGES = {
  country: "Please select your country.",
  fullName: "Please enter your full name.",
  fullNameLong: "Please shorten your full name to 200 characters.",
  businessName: "Please enter your business name.",
  businessNameLong: "Please shorten your business name to 200 characters.",
  businessHeadcount: "Please select your business headcount.",
  empty: "Please enter your email address.",
  invalid: "That doesn't look like a valid email address.",
  failed: "Something went wrong on our side. Please try again in a moment.",
} as const

/**
 * An address never starts with `=`, `+`, `-` or `@`: a spreadsheet or a CSV
 * import runs a cell that does as a formula. A leading tab or carriage return
 * is whitespace, which the form trims before it checks.
 */
export const EMAIL_PATTERN = /^(?![=+\-@])[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Free text without the leading characters a spreadsheet runs as a formula; no real name starts with one. */
export function plainText(text: string): string {
  return text.replace(/^[=+\-@\s]+/, "").trim()
}

/**
 * The two form fields a person never sees or fills. `trap` is a text input out
 * of sight, which a script that fills every field fills; `openedAt` is the
 * time in milliseconds at which the browser opened the form, which a script
 * that posts without loading the page leaves out.
 */
export const GUARD_FIELDS = { trap: "fax", openedAt: "openedAt" } as const

/** A form sent sooner than this after it opened was not filled by a person. */
export const MIN_FILL_MS = 3000
