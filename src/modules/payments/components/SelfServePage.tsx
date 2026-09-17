// S-P-11 `/parent/subscribe` (04 §6.2) — the self-serve road into the app, for a family who is not in a
// done-for-you cohort or whose month with the app has ended.
//
// **Three rules of the wording, all load-bearing** (ADR-082 / 091; P-4; 00-glossary §6 / §8). The self-serve
// road is stripped, not costless, and ADR-082 forbids the word most people would reach for; it is not a second
// product set beside the done-for-you service, because a family reading this screen is not choosing between
// two things; and the two shapes are said as "in one go" and "a month for {n} months" rather than in the
// vocabulary 05 §5.2 rules out. The words themselves live in `money-page-view.ts` and in the two labels below,
// which `payments.copy.test.ts` reads. Every amount comes from `prices()` — there is no number in this file.
import { formatMoney } from "../lib/format-money";
import { MoneyStandingPanel } from "./MoneyStandingPanel";
import { AskMatchmakerNote } from "./AskMatchmakerNote";
import type { MoneyPageView } from "../lib/money-page-view";
import type { Price } from "@/modules/purchase-paths";

export type SelfServePageProps = {
  readonly view: MoneyPageView;
  /**
   * What `selfServeShapes()` answered. **ADR-144: empty is an outage, not an answer** — the module could not
   * say what the two shapes are, so this screen says so instead of rendering a pay page with nothing on it.
   */
  readonly shapes: ReadonlyArray<Price>;
  /** Posts the chosen shape; the route turns it into a checkout and redirects. */
  readonly chooseAction: (formData: FormData) => Promise<void>;
  /** Set when the last attempt came back refused — announced by the panel's live region (a11y-19). */
  readonly refused: boolean;
};

const button =
  "mt-4 inline-flex w-full items-center justify-center rounded-md bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 active:bg-violet-900";

const shapeLabel = (shape: Price): string =>
  shape.shape.kind === "upfront"
    ? `${formatMoney(shape.total)} in one go`
    : `${formatMoney(shape.perPayment)} a month for ${shape.shape.count} months`;

export function SelfServePage({
  view,
  shapes,
  chooseAction,
  refused,
}: SelfServePageProps) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-semibold uppercase [letter-spacing:0.14em] text-violet-700">
        Your bundle
      </p>
      <div className="mt-2">
        <MoneyStandingPanel view={view} />
      </div>

      {refused ? (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800"
        >
          That payment didn&rsquo;t go through. Try again, or use a different
          card.
        </p>
      ) : null}

      {shapes.length === 0 ? (
        // ADR-144. Not `null`: a family who arrived here to pay must be told that the fault is ours and what to
        // do next, and the log line raised alongside it (`self-serve-shapes.ts`) is what tells us.
        <p
          role="alert"
          className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900"
        >
          We can&rsquo;t show your two ways to pay just now &mdash; nothing has
          changed about your place. Try again shortly, or your matchmaker will
          send you a link.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {shapes.map((shape) => (
            <form
              key={`${shape.preset}:${shape.shape.kind}`}
              action={chooseAction}
              className="rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <input
                type="hidden"
                name="shape"
                value={shape.shape.kind}
                readOnly
              />
              <input
                type="hidden"
                name="count"
                value={
                  shape.shape.kind === "instalments" ? shape.shape.count : 1
                }
                readOnly
              />
              <p className="text-lg font-semibold text-slate-900">
                {shapeLabel(shape)}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Either way it&rsquo;s the same app, and it stays open until your
                youngest turns 3 — for every child you have.
              </p>
              <button type="submit" className={button}>
                Take this one
              </button>
            </form>
          ))}
        </div>
      )}

      <AskMatchmakerNote />
    </main>
  );
}
