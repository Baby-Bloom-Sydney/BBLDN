// The shared body of the three money screens (04 §6.2 S-P-10 / S-P-11 / S-P-12): the headline, the plain
// sentence under it, and the facts beside it. A server component — the only interaction on these screens is a
// form posting a server action, so none of this belongs in a client bundle and ADR-133's `*/client` entry is
// not needed.
//
// The words come from `money-page-view.ts` and are never written here, so the copy suite has one file to read
// and a screen can never quietly grow a second vocabulary. The **state change is announced**: 04 §6.2's a11y-19
// asks that the payment-failed and link-expired messages be announced assertively and take focus, so the
// headline is the page's one live region and carries `tabIndex={-1}` for the route to focus.
import type { MoneyPageView } from "../lib/money-page-view";

export type MoneyStandingPanelProps = { readonly view: MoneyPageView };

const card = "rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm";

export function MoneyStandingPanel({ view }: MoneyStandingPanelProps) {
  return (
    <section aria-labelledby="money-standing">
      <h1
        id="money-standing"
        tabIndex={-1}
        aria-live="assertive"
        className="text-2xl font-bold text-slate-900 md:text-3xl"
      >
        {view.headline}
      </h1>
      <p className="mt-3 max-w-prose text-slate-600">{view.body}</p>

      {view.facts.length === 0 ? null : (
        <dl className={`mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 ${card}`}>
          {view.facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-xs font-semibold uppercase [letter-spacing:0.12em] text-slate-500">
                {fact.label}
              </dt>
              <dd className="mt-1 text-slate-900">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
