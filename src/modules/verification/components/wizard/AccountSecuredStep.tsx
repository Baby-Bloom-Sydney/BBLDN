"use client";
// S-N-03 — the "account secured" interstitial (04 §6.3): what the next four steps are and why, one button.
import { FIELD_STYLES } from "./field-styles";

export function AccountSecuredStep({
  onStart,
}: {
  readonly onStart: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">
        Families meet you through us, so we confirm four things before we
        introduce you: where you are and how to reach you, who you are, your
        Enhanced DBS certificate, and your right to work in the UK.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>Your area and mobile</li>
        <li>An identity document and a selfie</li>
        <li>Your DBS certificate</li>
        <li>Your right-to-work evidence</li>
      </ol>
      <p className="text-sm text-slate-600">
        A person on our team reviews what you send. You can stop at any step and
        come back later.
      </p>
      <button type="button" onClick={onStart} className={FIELD_STYLES.primary}>
        Start
      </button>
    </div>
  );
}
