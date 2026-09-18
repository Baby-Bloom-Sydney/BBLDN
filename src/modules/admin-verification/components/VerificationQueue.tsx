// S-A-16 `/admin/users?tab=verification` (04 §6.4; ADR-159): three sub-tabs — ID · DBS · Right-to-work — and no
// parent tab (ADR-071; AC-A-16); the two filters of 03 §4.3; the counters of AC-A-17; the open row's panel.
// Server component; every action is a prop; every link is built from `basePath`. Admin screens may use the
// team's own words (ADR-124 folds the nanny list only into nanny surfaces), but no currency sign and no
// Sydney check name appears here either.
import type { QueueTab, VerificationQueueProps } from "../types";
import { ENUMS } from "@/modules/shared-types";
import { QueueTable } from "./QueueTable";
import { SubmissionPanel } from "./SubmissionPanel";

const TABS: ReadonlyArray<{ readonly key: QueueTab; readonly label: string }> = [
  { key: "identity", label: "ID" },
  { key: "dbs", label: "DBS" },
  { key: "right-to-work", label: "Right to work" },
];

const FILTERS = [
  { key: "needs-admin", label: "Needs a person" },
  { key: "stale-pending", label: "Stuck pending" },
] as const;

export function VerificationQueue({ view, actions, basePath }: VerificationQueueProps) {
  if (view.kind !== "queue")
    return (
      <section aria-labelledby="verification-queue-heading">
        <h1 id="verification-queue-heading" className="text-2xl font-bold text-slate-900">
          Verification queue
        </h1>
        <p role="alert" className="mt-2 text-sm text-slate-700">
          {view.kind === "forbidden"
            ? "This screen needs an admin sign-in with a second factor."
            : "The queue could not be read. Reload the page."}
        </p>
      </section>
    );

  const { query, rows, overview, open } = view;
  const link = (tab: QueueTab, filter: string, openId?: string) =>
    `${basePath}?tab=${tab}&filter=${filter}${openId === undefined ? "" : `&open=${openId}`}`;

  return (
    <section aria-labelledby="verification-queue-heading" className="space-y-6">
      <header>
        <h1 id="verification-queue-heading" className="text-2xl font-bold text-slate-900">
          Verification queue
        </h1>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <dt className="text-slate-500">Needs a person</dt>
            <dd className="text-lg font-semibold text-slate-900">{overview.pending}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <dt className="text-slate-500">Verified today</dt>
            <dd className="text-lg font-semibold text-slate-900">{overview.verifiedToday}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <dt className="text-slate-500">Rejected today</dt>
            <dd className="text-lg font-semibold text-slate-900">{overview.rejectedToday}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <dt className="text-slate-500">Fully verified</dt>
            <dd className="text-lg font-semibold text-slate-900">{overview.fullyVerified}</dd>
          </div>
        </dl>
      </header>

      <nav aria-label="Verification tabs" className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <a
            key={tab.key}
            href={link(tab.key, query.filter)}
            aria-current={tab.key === query.tab ? "page" : undefined}
            className={
              tab.key === query.tab
                ? "rounded-md bg-violet-700 px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            }
          >
            {tab.label}
          </a>
        ))}
        <span className="mx-2 self-center text-slate-300" aria-hidden="true">
          |
        </span>
        {FILTERS.map((filter) => (
          <a
            key={filter.key}
            href={link(query.tab, filter.key)}
            aria-current={filter.key === query.filter ? "true" : undefined}
            className={
              filter.key === query.filter
                ? "rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            }
          >
            {filter.label}
          </a>
        ))}
      </nav>

      <QueueTable rows={rows} href={(id) => link(query.tab, query.filter, id)} />

      {open !== null && (
        <SubmissionPanel
          record={open}
          actions={actions}
          updateServiceResults={ENUMS.update_service_result}
        />
      )}
    </section>
  );
}
