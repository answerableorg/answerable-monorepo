"use server"

import { submitWaitlist, type WaitlistState } from "@/lib/waitlist"
import { GUARD_FIELDS } from "@/lib/waitlist-rules"

export async function joinFoundingCohort(
  _previous: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  return submitWaitlist({
    email: String(formData.get("email") ?? ""),
    country: String(formData.get("country") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
    guard: {
      trap: String(formData.get(GUARD_FIELDS.trap) ?? ""),
      elapsedMs: String(formData.get(GUARD_FIELDS.elapsedMs) ?? ""),
    },
    business: {
      name: String(formData.get("businessName") ?? ""),
      headcount: String(formData.get("businessHeadcount") ?? ""),
    },
  })
}
