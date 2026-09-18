// S-N-21 `/nanny/settings` (`03.24` Rejig; 04 §6.3): **Profile · Account (contact, Verification rows, Security)
// · Linked children · Contact us · Close account**, in that order, from `nannySettingsView`.
//
// **The commission pay section is dropped (N-2; T-2.5, ADR-027).** No payout, no ledger, no figure — and
// `onboarding-nanny.my-profile.test.ts` asserts that rather than trusting it.
//
// **Nothing here says anything about a hold** (ADR-157): every word about verification comes from
// `nannyVerificationSummary`, whose whole input is her level and her four section statuses.
import { DeleteMyAccount } from "@/modules/auth";
import type { NannySettingsProps } from "../types";
import { AccountPanel } from "./settings/AccountPanel";

const TILE = "rounded-lg border border-slate-200 bg-white p-4";
const LINK =
  "text-sm font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900";

function Section({
  section,
  href,
  children,
}: {
  readonly section: NannySettingsProps["view"]["sections"][number];
  readonly href: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`settings-${section.id}`}
      className={TILE}
      data-section={section.id}
    >
      <h2 id={`settings-${section.id}`} className="font-medium text-slate-900">
        {section.heading}
      </h2>
      <p className="mt-1 text-sm text-slate-600">{section.line}</p>
      {children}
      <a href={href} className={`mt-3 inline-block ${LINK}`}>
        {section.linkLabel}
      </a>
    </section>
  );
}

export function NannySettings({
  view,
  profile,
  options,
  action,
  deleteAction,
  verificationHref,
  hubHref,
  passwordHref,
}: NannySettingsProps) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold [letter-spacing:-0.025em] text-slate-900">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-600">{view.email}</p>
      </header>

      {view.sections.map((section) => (
        <Section
          key={section.id}
          section={section}
          href={section.id === "account" ? verificationHref : section.href}
        >
          {section.id === "account" ? (
            <AccountPanel
              view={view}
              profile={profile}
              options={options}
              action={action}
              passwordHref={passwordHref}
            />
          ) : null}
          {section.id === "close" ? (
            <DeleteMyAccount action={deleteAction} />
          ) : null}
        </Section>
      ))}

      <nav aria-label="Your account" className="text-sm">
        <a href={hubHref} className={LINK}>
          Back to your hub
        </a>
      </nav>
    </div>
  );
}
