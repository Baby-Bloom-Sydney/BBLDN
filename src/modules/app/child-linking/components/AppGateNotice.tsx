// The two non-open states of S-P-13 (04 §6.2), rendered from `appAccessView` and nowhere else.
//
// The distinction between them is the whole reason this component exists. `closed` is the paywall — in guide
// voice, saying what the family gets rather than what they lack, never the "your 30 days have run out" framing
// (04 §8; 00-glossary §6). `unknown` is an outage, and it carries **no action to pay**: `accessGate.hasAccess`
// fails closed by carrying `payments`' error rather than defaulting to `open: false` (`1h`), and this is where
// that choice earns its keep — a paying family caught in a database blip is told we couldn't check, not asked
// for money she has already paid.
import Link from "next/link";
import type { AppAccessView } from "../lib/app-access-view";

export type AppGateNoticeProps = {
  readonly view: Extract<
    AppAccessView,
    { readonly kind: "closed" | "unknown" }
  >;
};

export function AppGateNotice({ view }: AppGateNoticeProps) {
  return (
    <section
      aria-labelledby="app-gate-heading"
      className="rounded-2xl border border-violet-100 bg-white p-6 shadow-sm"
    >
      <h2
        id="app-gate-heading"
        className="text-lg font-semibold [letter-spacing:-0.01em] text-slate-900"
      >
        {view.heading}
      </h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-slate-600">
        {view.body}
      </p>
      {view.kind === "closed" ? (
        <Link
          href={view.action.href}
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        >
          {view.action.label}
        </Link>
      ) : null}
    </section>
  );
}
