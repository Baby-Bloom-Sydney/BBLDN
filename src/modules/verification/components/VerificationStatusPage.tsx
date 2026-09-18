// S-N-09 `/nanny/verification` (04 §6.3): resume / retry / status — the four sections, guidance where a section
// was sent back, "Fix it now" into the wizard at that step. Server component; every href is a prop. The level
// line reads the `05.22` names as the hub does.
import type { VerificationStatusPageProps } from "../types";
import { WIZARD_STEPS } from "../lib/wizard-steps";
import { SectionCard } from "./status/SectionCard";

const LEVEL_LINE: Readonly<Record<string, string>> = Object.freeze({
  L0_SIGNED_UP:
    "You're signed up — send your documents to be introduced to families.",
  L1_REGISTERED: "Your details are in — we're checking them.",
  L2_ID_VERIFIED: "Your identity is confirmed.",
  L3_PROVISIONALLY_VERIFIED: "Verified — you're in the pool.",
  L4_FULLY_VERIFIED: "Fully verified.",
});

const SECTIONS = ["contact", "identity", "dbs", "right-to-work"] as const;

export function VerificationStatusPage({
  state,
  hrefs,
}: VerificationStatusPageProps) {
  const stepOf = (section: string): number =>
    WIZARD_STEPS.find((step) => step.section === section)?.index ?? 0;
  return (
    <section aria-labelledby="verification-heading" className="space-y-6 py-8">
      <header>
        <h1
          id="verification-heading"
          className="text-2xl font-bold [letter-spacing:-0.025em] text-slate-900"
        >
          Your verification
        </h1>
        <p className="mt-2 text-sm text-slate-700" role="status">
          {state?.suspended
            ? "Your account is on hold — a person will be in touch."
            : LEVEL_LINE[state?.level ?? "L0_SIGNED_UP"]}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          A person on our team reviews every document you send.
        </p>
      </header>
      <ol className="space-y-3">
        {SECTIONS.map((name) => (
          <SectionCard
            key={name}
            section={
              state?.sections.find((entry) => entry.section === name) ?? {
                section: name,
                status: "not_started",
              }
            }
            fixHref={`${hrefs.wizard}?step=${stepOf(name)}`}
          />
        ))}
      </ol>
      <a
        href={hrefs.hub}
        className="text-sm font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900"
      >
        Back to your hub
      </a>
    </section>
  );
}
