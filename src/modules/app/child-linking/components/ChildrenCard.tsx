// **S-P-13's children card on `/parent`** (04 §6.2). A server component over `childrenCardView`; the gate's two
// closed states are delegated whole to `AppGateNotice`, so the paywall exists once in the tree.
//
// The share link is rendered as text the family can select and copy, not as a button that needs JavaScript to
// mean anything — it is the same token every time (there is no rotation), so a copy that happens twice is
// harmless and a copy that fails silently is not.
import Link from "next/link";
import type { ChildrenCardView } from "../lib/children-card-view";
import { AppGateNotice } from "./AppGateNotice";

export type ChildrenCardProps = { readonly view: ChildrenCardView };

export function ChildrenCard({ view }: ChildrenCardProps) {
  if (view.kind === "gate") {
    if (view.gate.kind === "open") return null;
    return <AppGateNotice view={view.gate} />;
  }

  if (view.kind === "no-child")
    return (
      <section
        aria-labelledby="children-heading"
        className="rounded-2xl border border-violet-100 bg-white p-6 shadow-sm"
      >
        <h2
          id="children-heading"
          className="text-lg font-semibold [letter-spacing:-0.01em] text-slate-900"
        >
          {view.heading}
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-slate-600">
          {view.body}
        </p>
        <Link
          href="/parent/settings"
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
        >
          {view.action}
        </Link>
      </section>
    );

  return (
    <section
      aria-labelledby="children-heading"
      className="rounded-2xl border border-violet-100 bg-white p-6 shadow-sm"
    >
      <h2
        id="children-heading"
        className="text-lg font-semibold [letter-spacing:-0.01em] text-slate-900"
      >
        {view.heading}
      </h2>
      <ul className="mt-4 space-y-3">
        {view.rows.map((row) => (
          <li
            key={row.childId}
            className="rounded-xl border border-slate-200 p-4 transition-colors hover:border-violet-200"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-base font-medium text-slate-900">
                {row.firstName}
              </p>
              <Link
                href={row.href}
                className="text-sm font-semibold text-violet-700 underline-offset-4 hover:underline"
              >
                {row.action}
              </Link>
            </div>
            <p className="mt-1 text-sm text-slate-600">{row.line}</p>
            {row.shareUrl === undefined ? null : (
              <p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                {row.shareUrl}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
