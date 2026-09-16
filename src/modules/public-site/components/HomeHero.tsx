// 01.09 / 01.10 — S-X-01's hero and the quick-match front door (04 §3.1 step 1: days × time, London area +
// postcode district). A plain GET form, no script: it lands on S-X-02 (`/results`) with the query
// `parseQuickMatchQuery` reads back (`1b` builds the results). The area combobox over the areas table (04 §6.1
// S-X-05 shape) arrives with `/api/areas` in `1b`; until then two labelled inputs.
import { BRAND } from "@/modules/config";
import type { ServiceAreaProps } from "../types";
import { PUBLIC_ROUTES } from "../lib/public-routes";
import { QUICK_MATCH_DAYS } from "../lib/quick-match-days";
import { QUICK_MATCH_PARTS } from "../lib/quick-match-parts";

const resultsPath =
  PUBLIC_ROUTES.find((route) => route.id === "S-X-02")?.path ?? "/results";

const chip =
  "cursor-pointer select-none rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors peer-checked:border-violet-500 peer-checked:bg-violet-50 peer-checked:text-violet-700 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500 peer-focus-visible:ring-offset-2 hover:border-slate-300";

export function HomeHero({ serviceAreaName }: ServiceAreaProps) {
  return (
    <section
      aria-labelledby="home-heading"
      className="relative overflow-hidden bg-[radial-gradient(ellipse_70%_60%_at_15%_20%,rgba(139,92,246,0.08),transparent)]"
    >
      <div className="container mx-auto grid items-start gap-12 px-4 py-16 md:px-6 md:py-24 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase [letter-spacing:0.2em] text-violet-500">
            {serviceAreaName}
          </p>
          <h1
            id="home-heading"
            className="mt-4 text-4xl font-bold leading-[1.08] [letter-spacing:-0.025em] text-slate-900 md:text-5xl lg:text-[3.5rem]"
          >
            Your family&apos;s nanny, introduced by someone who calls you.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-slate-600">
            Tell us your days, your times and your area. {BRAND.name} matches
            you with verified nannies near you — then your matchmaker calls to
            introduce you to your top nannies and sets up the meetings.
          </p>
          <ul className="mt-8 space-y-2 text-sm text-slate-600">
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-green-600">
                ✓
              </span>
              Every nanny is identity-checked and holds an Enhanced DBS.
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-green-600">
                ✓
              </span>
              Nannies who care about the early years — not just availability.
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-green-600">
                ✓
              </span>
              We check who is available and keen before your matchmaker calls.
            </li>
          </ul>
        </div>

        <form
          method="get"
          action={resultsPath}
          aria-labelledby="quick-match-heading"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-violet-500/5 md:p-8"
        >
          <h2
            id="quick-match-heading"
            className="text-xl font-semibold text-slate-900"
          >
            See nannies near you
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Three quick answers. No account needed yet.
          </p>

          <fieldset className="mt-6">
            <legend className="text-sm font-medium text-slate-900">
              Which days?
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_MATCH_DAYS.map((day) => (
                <div key={day.value}>
                  <input
                    id={`day-${day.value}`}
                    type="checkbox"
                    name="day"
                    value={day.value}
                    className="peer sr-only"
                  />
                  <label htmlFor={`day-${day.value}`} className={chip}>
                    <span className="sr-only">{day.label}</span>
                    <span aria-hidden="true">{day.short}</span>
                  </label>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="text-sm font-medium text-slate-900">
              Which times?
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_MATCH_PARTS.map((part) => (
                <div key={part.value}>
                  <input
                    id={`part-${part.value}`}
                    type="checkbox"
                    name="part"
                    value={part.value}
                    className="peer sr-only"
                  />
                  <label htmlFor={`part-${part.value}`} className={chip}>
                    {part.label}{" "}
                    <span className="text-slate-400">{part.hours}</span>
                  </label>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 grid gap-4 sm:grid-cols-[1.4fr_1fr]">
            <div>
              <label
                htmlFor="area"
                className="text-sm font-medium text-slate-900"
              >
                Your area
              </label>
              <input
                id="area"
                name="area"
                type="text"
                autoComplete="address-level2"
                maxLength={60}
                placeholder="e.g. Clapham"
                className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
            </div>
            <div>
              <label
                htmlFor="district"
                className="text-sm font-medium text-slate-900"
              >
                Postcode district
              </label>
              <input
                id="district"
                name="district"
                type="text"
                required
                inputMode="text"
                autoComplete="postal-code"
                pattern="[A-Za-z]{1,2}[0-9][A-Za-z0-9]?"
                maxLength={4}
                placeholder="e.g. SW4"
                aria-describedby="district-hint"
                className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase text-slate-900 placeholder:normal-case placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
              <p id="district-hint" className="mt-1 text-xs text-slate-400">
                The first part of your postcode.
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-md bg-violet-500 px-6 text-base font-medium text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          >
            Show my matches
          </button>
        </form>
      </div>
    </section>
  );
}
