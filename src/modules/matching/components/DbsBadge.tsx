// The DBS badge (04 §3.1 step 2 "a DBS-verified badge"; 03 §4.3): every nanny the view admits is identity-checked
// and holds an Enhanced DBS at level 3; level 4 adds the cross-check. Text, never colour alone (04 §6 a11y).
import type { VerificationLevel } from "../types";

export type DbsBadgeProps = {
  readonly level: VerificationLevel;
  readonly compact?: boolean;
};

export function DbsBadge({ level, compact }: DbsBadgeProps) {
  const fully = level === "L4_FULLY_VERIFIED";
  const label = fully
    ? "Fully verified · Enhanced DBS"
    : "Enhanced DBS-checked";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800"
      title="Identity checked and Enhanced DBS certificate seen"
    >
      <span aria-hidden="true">✓</span>
      {compact ? "DBS" : label}
      {compact ? <span className="sr-only"> — {label}</span> : null}
    </span>
  );
}
