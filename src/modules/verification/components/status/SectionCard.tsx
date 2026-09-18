// One section of S-N-09 (04 §6.3: "per section: not started · pending · verified · action required · in review ·
// suspended"; guidance cards). The status is text, never colour alone; the guidance line comes from the reason
// the reviewer recorded (04 §8 owns the final copy — draft ☐).
import type { SectionState } from "../../types";

const LABEL: Readonly<Record<SectionState["status"], string>> = Object.freeze({
  not_started: "Not started",
  pending: "Sent — waiting to be checked",
  processing: "Being checked",
  verified: "Confirmed",
  review: "In review — a person is looking at it",
  rejected: "Action needed",
  failed: "Action needed",
  expired: "Expired — please send it again",
});

const GUIDANCE: Readonly<Record<string, string>> = Object.freeze({
  "document-unreadable":
    "We couldn't read the file. Try a clearer photo or a PDF, with the whole page in view.",
  mismatch:
    "The details didn't match what you told us. Check the names and date of birth and send it again.",
  expired: "This document has expired. Please send a current one.",
  adverse: "A person on our team will be in touch about this one.",
  "unsupported-evidence":
    "That document type isn't one we can accept. Pick another from the list.",
});

const TITLE: Readonly<Record<SectionState["section"], string>> = Object.freeze({
  contact: "Where you are and how we reach you",
  identity: "Who you are",
  dbs: "Your DBS certificate",
  "right-to-work": "Your right to work",
});

const OPEN = new Set(["not_started", "rejected", "failed", "expired"]);

export function SectionCard({
  section,
  fixHref,
}: {
  readonly section: SectionState;
  readonly fixHref: string;
}) {
  const guidance =
    section.rejectionReason === undefined
      ? null
      : (GUIDANCE[section.rejectionReason] ?? null);
  return (
    <li
      className="rounded-lg border border-slate-200 bg-white p-4"
      data-section={section.section}
      data-status={section.status}
    >
      <h2 className="font-medium text-slate-900">{TITLE[section.section]}</h2>
      <p className="mt-1 text-sm text-slate-700">{LABEL[section.status]}</p>
      {guidance !== null && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {guidance}
        </p>
      )}
      {OPEN.has(section.status) && (
        <a
          href={fixHref}
          className="mt-2 inline-block text-sm font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900"
        >
          {section.status === "not_started" ? "Start this step" : "Fix it now"}
        </a>
      )}
    </li>
  );
}
