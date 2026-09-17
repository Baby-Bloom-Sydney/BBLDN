// S-P-12 `/parent/subscription` (04 §6.2) — where the bundle stands: the dates, what is left, when the window to
// say "this isn't right" closes, and the two levers a parent holds (change the card, stop the monthly payments).
// Both levers are the provider's hosted portal, so no card detail ever reaches this application (07 §10).
//
// **Stopping is not a refund.** A refund is never self-serve (money-model): Contact Us → a call → Stripe by hand.
// So the portal link says what it does — change the card, stop the monthly payments — and the note underneath is
// the road to a person for everything else.
import { MoneyStandingPanel } from "./MoneyStandingPanel";
import { AskMatchmakerNote } from "./AskMatchmakerNote";
import type { MoneyPageView } from "../lib/money-page-view";

export type BundleStatusPageProps = {
  readonly view: MoneyPageView;
  /** The hosted-portal form, or `null` when this standing has no portal to open. */
  readonly portalAction: (() => Promise<void>) | null;
};

const button =
  "inline-flex items-center rounded-md bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 active:bg-violet-900";

export function BundleStatusPage({
  view,
  portalAction,
}: BundleStatusPageProps) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-semibold uppercase [letter-spacing:0.14em] text-violet-700">
        Your bundle
      </p>
      <div className="mt-2">
        <MoneyStandingPanel view={view} />
      </div>

      {view.action.kind === "manage" && portalAction !== null ? (
        <form action={portalAction} className="mt-8">
          <button type="submit" className={button}>
            Change your card or stop the monthly payments
          </button>
        </form>
      ) : null}

      <AskMatchmakerNote />
    </main>
  );
}
