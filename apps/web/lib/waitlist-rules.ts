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

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
