// S-N-02 `/nanny/commission` (`03.37` NEW; 04 §4.4 c2 / c3; 04 §6.3 S-N-02) — "How it works", then the
// call-picking section on the same page.
//
// **What is deliberately not here.** No figure of any kind: the money model has not set them (D0.2, 04 §4.4
// c2 "No figures until…"). No pay dashboard, no ledger, no payout history — commission is arranged and paid by
// hand outside the system until that is proven (N-2, ADR-022). No bonus: London removed it, and what replaced
// it is a briefing call before her first day (ADR-099). No "call me later" road at all: she picks a slot or
// she has no call (ADR-073).
//
// **Whose words these are.** This is a nanny-facing page, so the parent list does not bind it (T-6.3), and
// glossary §6's scoped exception names S-N-02 for the picker's action verb. What does bind it is the nanny
// list (glossary §8 / ADR-124) — the position word, the currency sign, the Sydney check name, the city.
//
// Server component; every href and every action is a prop, so this file never reaches a connector barrel from
// a client bundle (01 §2.5). The picker is `call-layer`'s S-P-02, reused rather than forked (04 §6.2).
import { SlotPicker } from "@/modules/call-layer";
import type { NannyCommissionPageProps } from "../types";

const CARD = "rounded-lg border border-slate-200 bg-white p-5";
const LINK =
  "text-sm font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900";

export function NannyCommissionPage({
  view,
  actions,
  hubHref,
  addChildHref,
  brandName,
}: NannyCommissionPageProps) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 md:py-14">
      <section aria-labelledby="commission-heading">
        <h1
          id="commission-heading"
          className="text-3xl font-bold leading-tight [letter-spacing:-0.02em] text-slate-900 md:text-4xl"
        >
          How commission works
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600">
          Bring a family you already work for onto {brandName}. If they take the
          bundle, we pay you a commission — arranged with you personally, on a
          short call.
        </p>
        <ol className="mt-6 space-y-4 text-base leading-relaxed text-slate-700">
          <li>
            <span className="font-semibold text-slate-900">
              You add the family.
            </span>{" "}
            Add their child and we make you a link to pass on.{" "}
            <a href={addChildHref} className={LINK}>
              Add a family
            </a>
          </li>
          <li>
            <span className="font-semibold text-slate-900">They join.</span>{" "}
            They set themselves up with that link, and we take it from there.
          </li>
          <li>
            <span className="font-semibold text-slate-900">
              We agree your commission by voice.
            </span>{" "}
            On the call below we go through which families you have in mind and
            what we would pay for each. Nothing is worked out on a screen and
            nothing is deducted from what the family pays you.
          </li>
        </ol>
        <p className="mt-6 text-sm text-slate-600">
          Your arrangement with each family stays yours — your hours, your rate,
          your terms. {brandName} is not party to it.
        </p>
      </section>

      <section
        aria-labelledby="call-section-heading"
        className={`mt-10 ${CARD}`}
      >
        <h2
          id="call-section-heading"
          className="text-lg font-semibold text-slate-900"
        >
          {view.firstName === ""
            ? "Pick a time and we'll talk it through"
            : `${view.firstName}, pick a time and we'll talk it through`}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Have a think before the call about{" "}
          <span className="font-medium text-slate-900">
            which families you would bring
          </span>{" "}
          — that is the whole of it.
        </p>
        {/* ADR-074 in her words, before it happens rather than after: a family's call outranks hers, so a
            slot she has picked can move. Saying so here is the difference between a rescheduling email that
            reads as a mistake and one that reads as the thing we told her about. */}
        <p className="mt-2 text-sm text-slate-600">
          If a family needs that exact time, we&rsquo;ll move you to the next
          one free and email you the new time.
        </p>
        {view.mobile !== null && (
          <p className="mt-2 text-sm text-slate-600">
            We&rsquo;ll ring {view.mobile}. Change it in your settings if that
            is not the right one.
          </p>
        )}
        <div className="mt-6">
          <SlotPicker
            days={view.days}
            {...(view.chosen === null ? {} : { chosen: view.chosen })}
            actions={actions}
            dashboardHref={hubHref}
            copy={{
              heading: "Pick a time for your call",
              noSlotsLine:
                "No times free in the next fortnight — try again in a day or two.",
              loadFailedLine:
                "We couldn't load the times — try again in a moment.",
              backLabel: "Back to your hub",
            }}
          />
        </div>
      </section>
    </main>
  );
}
