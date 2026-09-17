// S-P-05 `/parent/position` (04 §6.2) — the position summary and its one lever. A server component: the only
// interaction is a form posting a server action, so nothing here needs to be a client bundle (and ADR-133's
// `*/client` entry is not needed).
//
// Guide voice, 00-glossary §6: no amount, no paid-path words — those are the call's (D2), and S-P-05 sits
// before it. What the family asked for, where it stands, and the way out.
import type { PositionStage } from "@/modules/shared-types";
import type { PositionPageView } from "../lib/position-page-view";

export type PositionPageProps = {
  readonly view: PositionPageView;
  readonly stage: PositionStage;
  readonly closeAction: (formData: FormData) => Promise<void>;
};

const card = "rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm";

export function PositionPage({ view, stage, closeAction }: PositionPageProps) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">
        What you asked for
      </h1>
      <p className="mt-2 text-slate-600">{view.stageLine}</p>

      <dl className={`mt-6 grid grid-cols-2 gap-4 ${card}`}>
        <div>
          <dt className="text-xs font-semibold uppercase [letter-spacing:0.12em] text-slate-500">
            Where
          </dt>
          <dd className="mt-1 text-slate-900">
            {view.area} · {view.district}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase [letter-spacing:0.12em] text-slate-500">
            Children
          </dt>
          <dd className="mt-1 text-slate-900">{view.childCount}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase [letter-spacing:0.12em] text-slate-500">
            Days a week
          </dt>
          <dd className="mt-1 text-slate-900">{view.days}</dd>
        </div>
      </dl>

      {view.canClose ? (
        <form action={closeAction} className="mt-8">
          <input type="hidden" name="expectedFrom" value={stage} />
          <button
            type="submit"
            className="text-sm font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            I no longer need a nanny
          </button>
        </form>
      ) : null}
    </main>
  );
}
