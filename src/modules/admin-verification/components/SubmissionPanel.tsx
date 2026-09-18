"use client";
// S-A-16's open row (04 §6.4; ADR-159): the nanny's four section states, the admin-only record (outcome,
// cross-check, Update Service), the reveal — signed URLs and the declared fields appear only after the audited
// open (07 §4.32) — and the decision form: verify, or reject with a reason and a note; for DBS the level-4
// Update Service form beside it. Every write is a server action passed in as a prop.
import { useFormState, useFormStatus } from "react-dom";
import type { ClientResult } from "@/modules/platform";
import type { EvidenceOpen, SectionState } from "@/modules/verification";
import type { ActionDetails, SubmissionPanelProps } from "../types";

const REASONS = [
  { key: "document-unreadable", label: "Document unreadable" },
  { key: "mismatch", label: "Details do not match" },
  { key: "expired", label: "Expired" },
  { key: "unsupported-evidence", label: "Not an accepted document" },
  { key: "adverse", label: "Adverse disclosure — bars the account" },
] as const;

const SECTION_LABEL: Readonly<Record<SectionState["section"], string>> = Object.freeze({
  contact: "Contact",
  identity: "Identity",
  dbs: "DBS",
  "right-to-work": "Right to work",
});

const RESULT_LABEL: Readonly<Record<string, string>> = Object.freeze({
  no_change: "No change — certificate stands",
  new_information: "New information — re-review",
  not_subscribed: "Not subscribed",
  check_failed: "Check failed",
});

function Submit({ label }: { readonly label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-60"
    >
      {pending ? "Working…" : label}
    </button>
  );
}

function Outcome({ state }: { readonly state: ClientResult<unknown, ActionDetails> | null }) {
  if (state === null) return null;
  if (state.ok)
    return (
      <p role="status" className="mt-2 text-sm text-emerald-800">
        Recorded.
      </p>
    );
  return (
    <p role="alert" className="mt-2 text-sm text-red-800">
      {state.error.message}
    </p>
  );
}

export function SubmissionPanel({ record, actions, updateServiceResults }: SubmissionPanelProps) {
  const [reveal, revealAction] = useFormState(actions.openEvidence, null);
  const [decided, decideAction] = useFormState(actions.decide, null);
  const [updateService, updateServiceAction] = useFormState(actions.recordUpdateService, null);
  const opened: EvidenceOpen | null = reveal !== null && reveal.ok ? reveal.value : null;
  const { entry, state, record: facts, note, nannyName } = record;

  return (
    <section
      aria-labelledby="submission-heading"
      className="space-y-5 rounded-lg border border-slate-200 bg-white p-4"
      data-submission={entry.submissionId}
    >
      <header>
        <h2 id="submission-heading" className="text-lg font-semibold text-slate-900">
          {nannyName} — {SECTION_LABEL[entry.section]}
        </h2>
        <p className="text-sm text-slate-600">
          Level: {state.level}
          {state.suspended ? " · suspended" : ""} · DBS outcome: {facts.dbsOutcome} · cross-check:{" "}
          {facts.crossCheckPassed ? "passed" : "not yet"}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {state.sections.map((section) => (
          <div key={section.section}>
            <dt className="text-slate-500">{SECTION_LABEL[section.section]}</dt>
            <dd className="text-slate-900">{section.status}</dd>
          </div>
        ))}
      </dl>

      <div>
        <h3 className="font-medium text-slate-900">Evidence</h3>
        {opened === null ? (
          <form action={revealAction} className="mt-2">
            <input type="hidden" name="submissionId" value={entry.submissionId} />
            <Submit label="Reveal documents and details" />
            <p className="mt-1 text-xs text-slate-500">
              Each reveal is recorded against your admin login.
            </p>
            <Outcome state={reveal} />
          </form>
        ) : (
          <div className="mt-2 space-y-2 text-sm">
            <ul className="list-disc pl-5">
              {opened.documents.map((doc) => (
                <li key={doc.section}>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-medium text-violet-700 underline underline-offset-2"
                  >
                    {doc.section}
                  </a>{" "}
                  <span className="text-slate-500">(link expires soon)</span>
                </li>
              ))}
            </ul>
            <dl className="grid grid-cols-2 gap-1">
              {Object.entries(opened.declared).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-slate-500">{key}</dt>
                  <dd className="text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {note !== undefined && (
        <p className="text-sm text-slate-700">
          <span className="text-slate-500">Previous note:</span> {note}
        </p>
      )}

      <form action={decideAction} className="space-y-3" noValidate>
        <h3 className="font-medium text-slate-900">Decision</h3>
        <input type="hidden" name="submissionId" value={entry.submissionId} />
        <fieldset className="space-y-1">
          <legend className="text-sm text-slate-700">Outcome</legend>
          <label className="block text-sm">
            <input type="radio" name="decision" value="verified" defaultChecked /> Verified
          </label>
          <label className="block text-sm">
            <input type="radio" name="decision" value="rejected" /> Rejected
          </label>
        </fieldset>
        <label className="block text-sm">
          <span className="text-slate-700">Reason (required for a rejection)</span>
          <select name="reason" className="mt-1 block rounded-md border border-slate-300 px-2 py-1">
            <option value="">—</option>
            {REASONS.map((reason) => (
              <option key={reason.key} value={reason.key}>
                {reason.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">Note (internal)</span>
          <textarea
            name="note"
            maxLength={500}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">Expires (optional, ISO instant)</span>
          <input
            name="expiresAt"
            type="text"
            placeholder="2027-01-10T00:00:00.000Z"
            className="mt-1 block rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
        <Submit label="Record decision" />
        <Outcome state={decided} />
      </form>

      {entry.section === "dbs" && (
        <form action={updateServiceAction} className="space-y-3" noValidate>
          <h3 className="font-medium text-slate-900">Update Service check (the level-4 step)</h3>
          <p className="text-sm text-slate-600">
            Consent given: {facts.updateService.consentAt === undefined ? "no" : "yes"}
            {facts.updateService.lastResult === undefined
              ? ""
              : ` · last result: ${RESULT_LABEL[facts.updateService.lastResult] ?? facts.updateService.lastResult}`}
          </p>
          <input type="hidden" name="nannyId" value={entry.nannyId} />
          <label className="block text-sm">
            <span className="text-slate-700">Result</span>
            <select name="result" className="mt-1 block rounded-md border border-slate-300 px-2 py-1">
              {updateServiceResults.map((result) => (
                <option key={result} value={result}>
                  {RESULT_LABEL[result] ?? result}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <input type="checkbox" name="subscribed" value="true" defaultChecked /> Subscribed to the
            Update Service
          </label>
          <Submit label="Record Update Service check" />
          <Outcome state={updateService} />
        </form>
      )}
    </section>
  );
}
