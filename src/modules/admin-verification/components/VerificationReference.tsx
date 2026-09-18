// S-A-17 `/admin/verification-reference` (04 §6.4): the admin's crib — levels, section statuses, who moves which
// status, and how the level follows (ADR-157) — built from the enums and the config, so it can never describe a
// code the schema does not carry (the Sydney page listed outcome codes London never had; row `12.08` — the AU
// jurisdiction word is gone from the sentence too, because naming it here bought nothing).
import { ENUMS } from "@/modules/shared-types";
import type { VerificationReferenceProps } from "../types";

const LEVEL_MEANING: Readonly<Record<string, string>> = Object.freeze({
  L0_SIGNED_UP:
    "Account exists; nothing submitted, or the DBS decision was adverse (suspended).",
  L1_REGISTERED: "Identity submitted; a person has it or it needs more.",
  L2_ID_VERIFIED: "Identity confirmed by a person.",
  L3_PROVISIONALLY_VERIFIED:
    "Identity + DBS certificate confirmed, the outcome cleared and the name cross-checked — in the pool; connections made now are held until level 4.",
  L4_FULLY_VERIFIED:
    "Level 3 plus an Update Service check recorded by an admin with no change — held connections released.",
});

const STATUS_MEANING: Readonly<Record<string, string>> = Object.freeze({
  not_started: "Nothing submitted for the section.",
  pending: "Submitted; waiting to be processed.",
  processing:
    "Claimed by the processing step; the stale sweep hands it to a person after the window.",
  verified: "Confirmed by a person (or a provider, when one is bound).",
  review: "Needs a person — it is in the queue.",
  rejected: "Sent back with a reason; the nanny resubmits.",
  failed: "The check could not run; the nanny resubmits.",
  expired: "Past its date; the nanny sends a current one.",
});

const MOVERS = [
  [
    "Nanny",
    "not_started → pending (submit) · rejected / failed / expired → pending (resubmit)",
  ],
  [
    "Processing step",
    "pending → processing (claim) · processing → review (stub-manual: every check needs a person)",
  ],
  [
    "Admin (queue)",
    "review → verified / rejected · DBS verified ⇒ outcome cleared + cross-check passed · adverse ⇒ barred + suspended · Update Service check ⇒ level 4",
  ],
  [
    "Named jobs",
    "processing → review after the stale window · verified → expired past the date",
  ],
  [
    "The sync",
    "reads every section and writes the level — never a client, never a form",
  ],
] as const;

export function VerificationReference({
  minVerificationLevel,
}: VerificationReferenceProps) {
  const pool = ENUMS.verification_level[minVerificationLevel];
  return (
    <section aria-labelledby="reference-heading" className="space-y-8">
      <header>
        <h1
          id="reference-heading"
          className="text-2xl font-bold text-slate-900"
        >
          Verification reference
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Levels, section statuses and who moves what. The pool opens at {pool}.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="text-left font-medium text-slate-900">
            Levels (in order)
          </caption>
          <thead>
            <tr className="text-left text-slate-500">
              <th scope="col" className="py-2 pr-4">
                Level
              </th>
              <th scope="col" className="py-2">
                Meaning
              </th>
            </tr>
          </thead>
          <tbody>
            {ENUMS.verification_level.map((level, index) => (
              <tr key={level} className="border-t border-slate-200">
                <th
                  scope="row"
                  className="py-2 pr-4 font-medium text-slate-900"
                >
                  {index} · {level}
                  {index === minVerificationLevel ? " (pool)" : ""}
                </th>
                <td className="py-2">{LEVEL_MEANING[level]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="text-left font-medium text-slate-900">
            Section statuses
          </caption>
          <thead>
            <tr className="text-left text-slate-500">
              <th scope="col" className="py-2 pr-4">
                Status
              </th>
              <th scope="col" className="py-2">
                Meaning
              </th>
            </tr>
          </thead>
          <tbody>
            {ENUMS.section_status.map((status) => (
              <tr key={status} className="border-t border-slate-200">
                <th
                  scope="row"
                  className="py-2 pr-4 font-medium text-slate-900"
                >
                  {status}
                </th>
                <td className="py-2">{STATUS_MEANING[status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="text-left font-medium text-slate-900">
            Who moves which status
          </caption>
          <thead>
            <tr className="text-left text-slate-500">
              <th scope="col" className="py-2 pr-4">
                Mover
              </th>
              <th scope="col" className="py-2">
                Moves
              </th>
            </tr>
          </thead>
          <tbody>
            {MOVERS.map(([mover, moves]) => (
              <tr key={mover} className="border-t border-slate-200">
                <th
                  scope="row"
                  className="py-2 pr-4 font-medium text-slate-900"
                >
                  {mover}
                </th>
                <td className="py-2">{moves}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-600">
        DBS outcomes: {ENUMS.dbs_outcome.join(" · ")}. Update Service results:{" "}
        {ENUMS.update_service_result.join(" · ")}. Right to work is a parallel
        section and never moves the level.
      </p>
    </section>
  );
}
