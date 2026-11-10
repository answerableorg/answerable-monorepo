import type { ReactNode } from "react"

import { BulletSquare } from "@/components/bullet-square"
import { CohortForm } from "@/components/new/cohort-form"
import { Lockup } from "@/components/new/lockup"
import { PEOPLE, VALUES, VALUES_FROM } from "@/components/new/scenes"
import { Stage } from "@/components/new/stage"
import { createMetadata, SITE } from "@/lib/metadata"
import { buttonVariants } from "@answerable/ui/lib/button"
import { cn } from "@answerable/ui/lib/utils"

export const metadata = createMetadata({
  pathname: "/new",
  title: "Answerable · AI Lead training and accreditation",
  absoluteTitle: true,
  index: false,
})

const structuredData = {
  "@context": "https://schema.org",
  "@graph": ["Organization", "WebSite"].map((type) => ({
    "@type": type,
    name: SITE.name,
    url: `${SITE.origin}/`,
    description: SITE.description,
  })),
}

const BENEFITS = [
  "The skills to lead your practice’s approach to AI",
  "An AI policy and handbook shaped around how you work",
  "A credential your clients can verify",
  "A community of AI Leads beyond the programme",
]

const TITLE =
  "text-[22px]/7 font-bold tracking-[-0.02em] text-balance lg:text-[28px]/8 min-[1800px]:text-[32px]/10"
const BODY = "text-base/6"
const MUTED = "text-muted-foreground"
const KICKER = "text-sm/6 font-bold"
/** A closing line dropped where the screen is short of room. */
const SPARE = "[@media(height<50rem)]:band:hidden [@media(height<30rem)]:hidden"
/** In the form's second step a short screen keeps only the form: five fields
    under each other on a phone, so sooner there. */
const FORM_ONLY =
  "[@media(height<30rem)]:group-data-[form-step=2]/scene:hidden [@media(height<42rem)]:band:group-data-[form-step=2]/scene:hidden"

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <Stage logo={<Lockup />}>
        <Scene from={0} id="join" labelledBy="hero-heading">
          <h1
            data-line
            id="hero-heading"
            className={cn(
              "text-[28px]/8 font-bold tracking-[-0.02em] text-balance min-[1800px]:text-[44px]/12 lg:text-[36px]/10",
              FORM_ONLY,
            )}
          >
            The professional standard for responsible AI.
          </h1>
          <p
            data-line
            className={cn(
              BODY,
              MUTED,
              "band:group-data-[form-step=2]/scene:hidden [@media(height<37rem)]:band:hidden mt-3 lg:mt-4 [@media(height<40rem)]:group-data-[form-step=2]/scene:hidden",
              FORM_ONLY,
            )}
          >
            Answerable trains and accredits the people who lead AI in
            professional practices. Register to join the founding cohort.
          </p>
          <div
            data-line
            className="[@media(height<42rem)]:band:group-data-[form-step=2]/scene:mt-0 mt-6 lg:mt-8 [@media(height<30rem)]:mt-4 [@media(height<30rem)]:group-data-[form-step=2]/scene:mt-0"
          >
            <CohortForm />
          </div>
        </Scene>

        <Scene from={1} labelledBy="programme-heading">
          <p data-line className={KICKER}>
            The Answerable AP programme
          </p>
          {/* One sentence per line, so "A" never ends the first. */}
          <h2 data-line id="programme-heading" className={cn(TITLE, "mt-2")}>
            <span className="block">One accredited AI Lead.</span>{" "}
            <span className="block">
              A practice that can answer for its AI.
            </span>
          </h2>
          <ul className="cols:mt-6 cols:gap-2 mt-4 flex flex-col gap-1">
            {BENEFITS.map((benefit) => (
              <li key={benefit} data-line className={cn(BODY, "flex gap-3")}>
                <BulletSquare />
                {benefit}
              </li>
            ))}
          </ul>
          <p data-line className={cn(BODY, MUTED, "mt-6", SPARE)}>
            It works across whichever AI tools you use, now and in the future.
          </p>
        </Scene>

        <Scene
          from={VALUES_FROM}
          to={VALUES_FROM + VALUES.length - 1}
          labelledBy="values-heading"
        >
          <div data-line>
            <h2 id="values-heading" className={KICKER}>
              Built upon six core values
            </h2>
            <p className={cn("text-sm/6", MUTED)}>
              Everything we teach and assess is rooted in six commitments.
            </p>
          </div>
          {/* The index: a square of colour slides from number to number,
              each value's colour a layer that fades in over the last. Each
              number is a button to its value. */}
          <div
            data-line
            role="group"
            aria-label="Go to a value"
            className="stage:flex relative mt-6 hidden gap-2"
          >
            <span
              data-highlight
              aria-hidden="true"
              className="absolute top-0 left-0 size-8"
            >
              {VALUES.map((value, index) => (
                <span
                  key={value.text}
                  data-tint
                  className="absolute inset-0 will-change-[opacity]"
                  style={{
                    backgroundColor: value.colour,
                    opacity: index === 0 ? 1 : 0,
                  }}
                />
              ))}
            </span>
            {/* The button is not positioned, so its number's place is read
                against the row and its square on hover lies under the
                highlight; its padding is room for a finger. */}
            {VALUES.map((value, index) => (
              <button
                key={value.text}
                type="button"
                data-go={VALUES_FROM + index}
                aria-label={`Value ${index + 1}`}
                className="hover:bg-foreground/5 focus-visible:outline-foreground -m-1 cursor-pointer bg-clip-content p-1 focus-visible:outline-2 focus-visible:-outline-offset-4"
              >
                <span
                  data-mark
                  className="relative grid size-8 place-items-center text-sm font-black tabular-nums"
                >
                  {index + 1}
                </span>
              </button>
            ))}
          </div>
          <ol
            data-line
            className="stage:grid stage:gap-0 stage:overflow-hidden mt-6 flex flex-col gap-4"
          >
            {VALUES.map((value, index) => (
              <li
                key={value.text}
                data-step
                className="stage:[grid-area:1/1] flex gap-3 text-[24px]/8 font-bold tracking-[-0.02em] text-balance min-[1800px]:text-[40px]/12 lg:text-[32px]/10"
              >
                <span
                  className="stage:sr-only font-black tabular-nums"
                  style={{ color: value.colour }}
                >
                  {index + 1}
                </span>
                <span>{value.text}</span>
              </li>
            ))}
          </ol>
        </Scene>

        <Scene from={8} labelledBy="people-heading">
          <h2 data-line id="people-heading" className={TITLE}>
            The people behind the programme
          </h2>
          <ul className="cols:mt-6 cols:gap-4 mt-4 flex flex-col gap-3">
            {PEOPLE.map((person) => (
              <li key={person.name} data-line className="flex gap-3">
                {/* Each person's own square. */}
                <span
                  aria-hidden="true"
                  className="mt-2 size-2 shrink-0"
                  style={{ backgroundColor: person.colour }}
                />
                <div>
                  <p className={cn(BODY, "font-bold")}>{person.name}</p>
                  <p className={cn(BODY, MUTED)}>{person.line}</p>
                </div>
              </li>
            ))}
          </ul>
          <p data-line className={cn(BODY, "mt-6", SPARE)}>
            Together, they are developing a programme for professionals who want
            to take an active part in how AI shapes their work.
          </p>
        </Scene>

        <Scene from={9} labelledBy="cohort-heading">
          <h2 data-line id="cohort-heading" className={TITLE}>
            Join the founding cohort
          </h2>
          <p data-line className={cn(BODY, MUTED, "mt-3")}>
            Be among the first to earn the Answerable AP credential. We’re
            keeping the cohort small, so every participant gets the support and
            assessment the programme requires.
          </p>
          <div data-line className="mt-6">
            <a
              href="#join"
              data-go="0"
              className={buttonVariants({ className: "gap-1.5" })}
            >
              Register your interest
              <span aria-hidden="true">↑</span>
            </a>
          </div>
        </Scene>
      </Stage>
    </>
  )
}

/**
 * One scene of the stage. Without the stage it is a section in the column;
 * with it, every scene sits in the copy area's one cell, its lines moved by
 * the scroll (`data-line`), so each starts on the same line: the top of the
 * tallest, which the column centres. Under a band, the top of the area.
 */
function Scene({
  from,
  to = from,
  id,
  labelledBy,
  children,
}: {
  from: number
  to?: number
  id?: string
  labelledBy: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      data-scene
      data-from={from}
      data-to={to}
      aria-labelledby={labelledBy}
      className="group/scene stage:band:pt-6 stage:[grid-area:1/1] flex flex-col"
    >
      {children}
    </section>
  )
}
