// S-A-16's list (04 §6.4: `<caption>`, `th scope`, the filtered row count announced, the open control a real
// link — a11y-9 / a11y-15). Status is text, never a colour alone. The name is the only personal detail on the list;
// the declared fields live behind the reveal (07 §4.32).
import { formatLondon } from "../lib/format-london";
import type { QueueRow } from "../types";

const EVIDENCE_LABEL: Readonly<Record<string, string>> = Object.freeze({
  "identity-document": "ID document",
  selfie: "Selfie",
  "dbs-certificate": "DBS certificate",
  "dbs-update-service": "Update Service",
  "right-to-work-passport": "Passport",
  "right-to-work-share-code": "Share code",
  "right-to-work-document": "Immigration document",
});

const STATUS_LABEL: Readonly<Record<QueueRow["status"], string>> = Object.freeze({
  "needs-admin": "Needs a person",
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
});

export function QueueTable({
  rows,
  href,
}: {
  readonly rows: ReadonlyArray<QueueRow>;
  readonly href: (submissionId: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <p className="sr-only" aria-live="polite">
        {rows.length} {rows.length === 1 ? "item" : "items"} listed
      </p>
      <table className="w-full text-sm">
        <caption className="sr-only">Verification queue</caption>
        <thead>
          <tr className="text-left text-slate-500">
            <th scope="col" className="py-2 pr-4 font-medium">
              Nanny
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Evidence
            </th>
            <th scope="col" className="py-2 pr-4 font-medium" aria-sort="ascending">
              Submitted (London)
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Status
            </th>
            <th scope="col" className="py-2 font-medium">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 text-slate-500">
                Nothing waiting here.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.submissionId}
                className="border-t border-slate-200"
                data-submission={row.submissionId}
              >
                <td className="py-2 pr-4 text-slate-900">{row.nannyName}</td>
                <td className="py-2 pr-4">
                  {EVIDENCE_LABEL[row.evidenceType] ?? row.evidenceType}
                </td>
                <td className="py-2 pr-4">
                  <time dateTime={row.submittedAt}>{formatLondon(row.submittedAt)}</time>
                </td>
                <td className="py-2 pr-4">{STATUS_LABEL[row.status]}</td>
                <td className="py-2">
                  <a
                    href={href(row.submissionId)}
                    className="inline-block min-h-6 min-w-6 font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900"
                  >
                    Open
                  </a>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
