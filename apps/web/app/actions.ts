"use server"

import { submitWaitlist, type WaitlistState } from "@/lib/waitlist"

export async function joinFoundingCohort(
  _previous: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  return submitWaitlist({
    email: String(formData.get("email") ?? ""),
    country: String(formData.get("country") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
    business: {
      name: String(formData.get("businessName") ?? ""),
      headcount: String(formData.get("businessHeadcount") ?? ""),
    },
  })
}
