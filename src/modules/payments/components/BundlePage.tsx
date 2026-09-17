// S-P-10 `/parent/bundle` (04 §6.2) — "don't pay until you're happy with your nanny", told as the family's own
// standing rather than as a pitch. It lives **inside the app, after the call**: the amount is never shown before
// the call (D2), and by the time a family reaches this screen her matchmaker has already said the number aloud.
//
// A parent cannot pay from here and that is the design (ADR-094 / 097): her matchmaker sends the payment link
// by email, and this screen is where she checks what it was for, what is left, and by when. The states of the
// register — deposit due · deposit held · app on, payment due · paid — are the standings underneath, so there is
// no second state machine on the screen.
import { MoneyStandingPanel } from "./MoneyStandingPanel";
import { AskMatchmakerNote } from "./AskMatchmakerNote";
import type { MoneyPageView } from "../lib/money-page-view";

export type BundlePageProps = { readonly view: MoneyPageView };

export function BundlePage({ view }: BundlePageProps) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-semibold uppercase [letter-spacing:0.14em] text-violet-700">
        Your bundle
      </p>
      <div className="mt-2">
        <MoneyStandingPanel view={view} />
      </div>
      <p className="mt-6 max-w-prose text-sm text-slate-600">
        You don&rsquo;t pay until you&rsquo;re happy with your nanny. Nothing is
        taken on the call and nothing on her first day — the amount falls due a
        week after she starts, with your deposit and her first week already
        taken off.
      </p>
      <AskMatchmakerNote />
    </main>
  );
}
