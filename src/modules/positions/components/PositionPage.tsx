// S-P-05 `/parent/position` (04 §6.2) — the position summary and its one lever. A server component: the only
// interaction is a form posting a server action, so nothing here needs to be a client bundle (and ADR-133's
// `*/client` entry is not needed).
//
// Guide voice, 00-glossary §6: no amount, no paid-path words — those are the call's (D2), and S-P-05 sits
// before it. What the family asked for, where it stands, and the way out.
import Link from "next/link";
import type { PositionStage } from "@/modules/shared-types";
import type { PositionPageView } from "../lib/position-page-view";

export type PositionPageProps = {
  readonly view: PositionPageView;
  readonly stage: PositionStage;
  readonly closeAction: (formData: FormData) => Promise<void>;
  /**
   * 04 §6.2 — S-P-05's "S-P-04 (edit)" exit. Handed in by the route rather than named here: `positions` owns
   * what may change and when, `app` owns where the screen that changes it lives. Shown only when
   * `view.canEdit`, so the link never points at a screen that would refuse her at the end of it.
   */
  readonly editHref?: string;
};

const card = "rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm";

const quiet =
  "text-sm font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500";

/** One fact of the summary. A `dt` / `dd` pair, so the summary stays a description list for a screen reader. */
function Fact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase [letter-spacing:0.12em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-slate-900">{children}</dd>
    </div>
  );
}

export function PositionPage({
  view,
  stage,
  closeAction,
  editHref,
}: PositionPageProps) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">
        What you asked for
      </h1>
      <p className="mt-2 text-slate-600">{view.stageLine}</p>

      <dl className={`mt-6 grid grid-cols-2 gap-4 ${card}`}>
        <Fact label="Where">
          {view.area} · {view.district}
        </Fact>
        <Fact label="Children">{view.childCount}</Fact>
        <Fact label="Days a week">{view.days}</Fact>
      </dl>

      {view.canEdit && editHref !== undefined ? (
        <p className="mt-6">
          <Link href={editHref} className={quiet}>
            Change what you asked for
          </Link>
        </p>
      ) : null}

      {view.canClose ? (
        <form action={closeAction} className="mt-8">
          <input type="hidden" name="expectedFrom" value={stage} />
          <button type="submit" className={quiet}>
            I no longer need a nanny
          </button>
        </form>
      ) : null}
    </main>
  );
}
