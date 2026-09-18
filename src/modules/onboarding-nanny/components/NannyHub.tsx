// S-N-11 `/nanny` — the hub in its three states (04 §6.3; ADR-147): `isolated` is S-N-22 (the child, Katie and
// settings only — the positions board, the team page and the pool are out of reach), `gated` shows the
// verification banner, `open` the in-pool line. The positions board is `2d`'s (ADR-148 (3)) and the hub says
// so rather than rendering an empty list. Server component; every href is a prop.
import type { NannyHubProps } from "../types";

const TILE = "rounded-lg border border-slate-200 bg-white p-4";
const LINK =
  "text-sm font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900";

export function NannyHub({
  view,
  profileHref,
  verificationHref,
  settingsHref,
  childrenHref,
  addChildHref,
  commissionHref,
}: NannyHubProps) {
  return (
    <div className="space-y-6" data-hub-state={view.state}>
      <header>
        <h1 className="text-2xl font-bold [letter-spacing:-0.025em] text-slate-900">
          {view.firstName ? `Hello, ${view.firstName}` : "Hello"}
        </h1>
        <p className="mt-2 text-sm text-slate-700" role="status">
          {view.line}
        </p>
        {view.action !== null && (
          <a
            href={view.action.href}
            className="mt-4 inline-flex items-center rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            {view.action.label}
          </a>
        )}
      </header>
      {!view.profileComplete && view.state !== "isolated" && (
        <section aria-labelledby="profile-heading" className={TILE}>
          <h2 id="profile-heading" className="font-medium text-slate-900">
            Finish your profile
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            A complete profile is what a family reads when we introduce you.
          </p>
          <a href={profileHref} className={`mt-2 inline-block ${LINK}`}>
            Complete my profile
          </a>
        </section>
      )}
      {view.state === "open" && (
        <section aria-labelledby="positions-heading" className={TILE}>
          <h2 id="positions-heading" className="font-medium text-slate-900">
            Families looking now
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            When a family near you fits your days and your rate, it shows here
            first — and we email you.
          </p>
        </section>
      )}
      <section aria-labelledby="children-heading" className={TILE}>
        <h2 id="children-heading" className="font-medium text-slate-900">
          Your children&rsquo;s app
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          The children you&rsquo;re linked to, their days and what comes next.
        </p>
        <a href={childrenHref} className={`mt-2 inline-block ${LINK}`}>
          Open the app
        </a>
      </section>
      {/* 04 §4.4 c1 — the pitch again from the hub's children card, and the explainer one link on. An
          isolated nanny sees neither until she applies (ADR-147): she has one family and is not in the pool,
          so an invitation to bring more would be an offer she cannot act on. */}
      {view.state !== "isolated" && (
        <section aria-labelledby="commission-heading" className={TILE}>
          <h2 id="commission-heading" className="font-medium text-slate-900">
            Get paid for adding existing clients
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Already with a family? Add them here and we&rsquo;ll arrange a
            commission with you personally.
          </p>
          <div className="mt-2 flex flex-wrap gap-4">
            <a href={addChildHref} className={LINK}>
              Add a family
            </a>
            <a href={commissionHref} className={LINK}>
              How commission works
            </a>
          </div>
        </section>
      )}
      <nav aria-label="Your account" className="flex flex-wrap gap-4 text-sm">
        <a href={profileHref} className={LINK}>
          My profile
        </a>
        {view.state !== "isolated" && (
          <a href={verificationHref} className={LINK}>
            Verification
          </a>
        )}
        <a href={settingsHref} className={LINK}>
          Settings
        </a>
      </nav>
    </div>
  );
}
