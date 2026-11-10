"use client"

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { flushSync } from "react-dom"

import { joinFoundingCohort } from "@/app/actions"
import { HEADCOUNTS } from "@/lib/headcounts"
import type { WaitlistState } from "@/lib/waitlist"
import { EMAIL_PATTERN, MESSAGES } from "@/lib/waitlist-rules"
import { Button } from "@answerable/ui/components/button"
import { CountrySelect } from "@answerable/ui/components/country-select"
import { Field, FieldError, FieldLabel } from "@answerable/ui/components/field"
import { Form } from "@answerable/ui/components/form"
import { Input } from "@answerable/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@answerable/ui/components/select"
import { cn } from "@answerable/ui/lib/utils"

const initialState: WaitlistState = { status: "idle" }

/**
 * The founding cohort's form, in two steps: the work email first, then the
 * person and the practice. Both steps post together to `joinFoundingCohort`,
 * which requires every field. The second step shows only once the address
 * looks right, and marks its scene `data-form-step="2"` so the hero can make
 * room. Without the stage script every field shows at once, and the form
 * posts as it is.
 */
export function CohortForm() {
  const [state, formAction, pending] = useActionState(
    joinFoundingCohort,
    initialState,
  )
  const [step, setStep] = useState<1 | 2>(1)
  const [emailError, setEmailError] = useState<string>()
  const formRef = useRef<HTMLFormElement>(null)
  const doneRef = useRef<HTMLParagraphElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const done = state.status === "success"
  useEffect(() => {
    ;(formRef.current ?? doneRef.current)
      ?.closest("[data-scene]")
      ?.setAttribute("data-form-step", done ? "done" : String(step))
  }, [step, done])

  if (state.status === "success") {
    return (
      <p ref={doneRef} role="status" className="text-base/6">
        <span className="font-bold">Thank you.</span> We&apos;ll email{" "}
        {state.email} the programme details when enrolment opens.
      </p>
    )
  }

  const serverErrors = state.status === "error" ? state.errors : undefined
  const errors = emailError
    ? { ...serverErrors, email: emailError }
    : serverErrors

  // Synchronous, so a phone keeps its keyboard as focus moves on.
  const next = () => {
    const email = emailRef.current?.value.trim() ?? ""
    const error = !email
      ? MESSAGES.empty
      : EMAIL_PATTERN.test(email)
        ? undefined
        : MESSAGES.invalid
    if (error) {
      setEmailError(error)
      emailRef.current?.focus()
      return
    }
    flushSync(() => {
      setEmailError(undefined)
      setStep(2)
    })
    nameRef.current?.focus()
  }

  // Posting through a transition, not the form's own action, keeps what was
  // typed: React resets an action's form afterwards, errors or not. The
  // `action` stays for a submit before hydration.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const staged = document.documentElement.hasAttribute("data-stage")
    if (staged && step === 1) return next()
    const data = new FormData(event.currentTarget)
    startTransition(() => formAction(data))
  }

  // Before the second step, with the stage on, only the email shows.
  const first = step === 1

  return (
    <Form
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      errors={errors}
      className="w-full gap-3"
    >
      <Field name="email">
        <FieldLabel>Work email</FieldLabel>
        <div className="flex gap-2">
          <Input
            ref={emailRef}
            type="text"
            inputMode="email"
            name="email"
            autoComplete="email"
            placeholder="you@practice.com"
            onChange={() => emailError && setEmailError(undefined)}
          />
          <Button
            type="button"
            onClick={next}
            className={cn("hidden shrink-0", first && "stage:inline-flex")}
          >
            Continue
          </Button>
        </div>
        <FieldError />
      </Field>

      <div
        className={cn(
          "grid gap-3 sm:grid-cols-2",
          first
            ? "stage:hidden"
            : "animate-in fade-in-0 slide-in-from-top-2 duration-200 ease-out motion-reduce:animate-none",
        )}
      >
        <Field name="fullName">
          <FieldLabel>Full name</FieldLabel>
          <Input
            ref={nameRef}
            type="text"
            name="fullName"
            autoComplete="name"
            autoCapitalize="words"
          />
          <FieldError />
        </Field>
        <Field name="businessName">
          <FieldLabel>Business name</FieldLabel>
          <Input type="text" name="businessName" autoComplete="organization" />
          <FieldError />
        </Field>
        <Field name="businessHeadcount">
          <FieldLabel nativeLabel={false}>Headcount</FieldLabel>
          <Select name="businessHeadcount">
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {HEADCOUNTS.map((band) => (
                <SelectItem key={band} value={band}>
                  {band}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError />
        </Field>
        <Field name="country">
          <FieldLabel nativeLabel={false}>Country</FieldLabel>
          <CountrySelect name="country" placeholder="Select" />
          <FieldError />
        </Field>
        <Button
          type="submit"
          disabled={pending}
          className="w-full gap-1.5 sm:col-span-2"
        >
          {pending ? "Registering…" : "Register interest"}
          <span
            aria-hidden="true"
            className="font-system text-primary-foreground"
          >
            ⏎
          </span>
        </Button>
      </div>

      {state.status === "error" && state.message && (
        <p role="alert" className="text-sm/6 font-medium">
          {state.message}
        </p>
      )}
      <p className="text-muted-foreground [@media(height<35rem)]:band:group-data-[form-step=2]/scene:hidden text-sm/6 [@media(height<30rem)]:group-data-[form-step=2]/scene:hidden">
        Registering interest does not reserve a place or commit you to enrol.
      </p>
    </Form>
  )
}
