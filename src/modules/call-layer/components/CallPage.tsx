// S-P-01 — "Your matchmaker will call you. Pick a time." (04 §6.2; 04 §8 copy anchors; ADR-073). The promise
// is level 2 (intro-call D6); the variant line names the nanny after a self-serve Connect (trigger (c)), says
// the app for an invite-arrived parent (path E), or says "we'll try again" after a no-answer. The slot picker
// (S-P-02) sits inline. No 24-hour option; the banned verb appears nowhere but the picker's button (glossary §6).
import type { CallPageProps, CallPageView } from "../types";
import { SlotPicker } from "./SlotPicker";

const PROMISE =
  "Before we call, we'll check which of your top nannies are available and keen. On the call, you'll choose who to meet — we'll set up the meetings.";

const variantLine = (view: CallPageView): string | null => {
  if (view.variant === "after-connect")
    return `Your matchmaker will call you about ${view.aboutNanny}.`;
  if (view.variant === "onboarding")
    return view.aboutNanny === undefined
      ? "Your matchmaker will call you — we'll get you set up in the app."
      : `Your matchmaker will call you — we'll get you and ${view.aboutNanny} set up in the app.`;
  if (view.variant === "after-no-answer")
    return "We tried to reach you — pick a time and we'll try again.";
  return null;
};

export function CallPage({
  view,
  days,
  actions,
  dashboardHref,
}: CallPageProps) {
  const line = variantLine(view);
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 md:py-14">
      <section aria-labelledby="call-heading">
        <h1
          id="call-heading"
          className="text-3xl font-bold leading-tight [letter-spacing:-0.02em] text-slate-900 md:text-4xl"
        >
          Your matchmaker will call you. Pick a time.
        </h1>
        {line !== null && (
          <p className="mt-4 text-base font-medium text-violet-700">{line}</p>
        )}
        <p className="mt-4 text-base leading-relaxed text-slate-600">
          {PROMISE}
        </p>
      </section>
      <div className="mt-10">
        <SlotPicker
          positionId={view.positionId}
          days={days}
          {...(view.chosen === undefined ? {} : { chosen: view.chosen })}
          actions={actions}
          dashboardHref={dashboardHref}
        />
      </div>
    </main>
  );
}
