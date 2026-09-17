// S-X-24 `/childcare-professionals` (04 §6.1): the nanny entry page → `/apply`. Rejig — London families; the
// checklist names the Enhanced DBS and the right to work; the babysitting card is gone (N-1). A public page, so
// the parent list binds it too (glossary §6) — no "free", no "fee", no "information". Brand from config via the
// route (L4). Server component; no data.
import type { NannyEntryContentProps } from "../types";

const WHY = [
  {
    title: "Families who value what you do",
    body: "The families we introduce care about their child's early years and treat their nanny as the professional she is.",
  },
  {
    title: "Your terms, always",
    body: "Your rate, your hours, your agreement with the family. We introduce; what you agree is between you.",
  },
  {
    title: "One introduction at a time",
    body: "No scrolling, no cold messages. When a family near you fits, we tell you first and ask if you're keen.",
  },
] as const;

const CHECKLIST = [
  "Real experience with young children — formal or family",
  "An Enhanced DBS certificate (on the Update Service is ideal)",
  "The right to work in the UK",
  "You're reliable, and you take pride in the work",
] as const;

const STEPS = [
  ["Apply", "About ten minutes — where you are, your experience, what you're looking for."],
  ["Verify", "Your ID, your DBS certificate and your right to work, checked by a person."],
  ["Be introduced", "A family near you who fits your days and your rate hears about you first."],
  ["Start", "Meet, agree the terms together, and do what you do best."],
] as const;

export function NannyEntryContent({ applyHref, brandName }: NannyEntryContentProps) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">For childcare professionals</p>
        <h1 className="mt-2 text-3xl font-bold [letter-spacing:-0.025em] text-slate-900 sm:text-4xl">
          Work with London families who take early years seriously
        </h1>
        <p className="mt-4 text-base text-slate-700">
          {brandName} introduces experienced nannies to families across Greater London. You apply once; we do the
          finding.
        </p>
        <a href={applyHref} className="mt-6 inline-flex items-center rounded-md bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700">
          Apply to join
        </a>
      </header>
      <section aria-labelledby="why-heading" className="mt-12">
        <h2 id="why-heading" className="text-xl font-semibold text-slate-900">Why nannies choose us</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          {WHY.map((card) => (
            <li key={card.title} className="rounded-lg border border-slate-200 p-4">
              <h3 className="font-medium text-slate-900">{card.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{card.body}</p>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="fit-heading" className="mt-12">
        <h2 id="fit-heading" className="text-xl font-semibold text-slate-900">You'll fit right in if</h2>
        <ul className="mt-4 space-y-2 text-sm text-slate-700">
          {CHECKLIST.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden="true" className="text-violet-600">✓</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="how-heading" className="mt-12">
        <h2 id="how-heading" className="text-xl font-semibold text-slate-900">How it works</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map(([title, body], index) => (
            <li key={title} className="flex gap-3 text-sm">
              <span className="font-semibold text-violet-700">{String(index + 1).padStart(2, "0")}</span>
              <span>
                <span className="font-medium text-slate-900">{title}.</span> <span className="text-slate-700">{body}</span>
              </span>
            </li>
          ))}
        </ol>
        <a href={applyHref} className="mt-8 inline-flex items-center rounded-md bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700">
          Start your application
        </a>
      </section>
    </article>
  );
}
