// S-N-21's Account section (04 §6.3): contact, the three verification rows, security. Server component around
// the one client panel.
//
// The verification half says exactly what `nannyVerificationSummary` gives it — her level and her four section
// statuses — and therefore **never names the hold** (ADR-157). Security is a link, not a password field: S-X-09
// emails her a link, which is the one road this product has to a new password.
import type { NannySettingsProps } from "../../types";
import { NannyContactPanel } from "./NannyContactPanel";

const LINK =
  "text-sm font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900";

function Security({ passwordHref }: { readonly passwordHref: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">Security</h3>
      <p className="mt-1 text-sm text-slate-600">
        We&rsquo;ll email you a link to set a new password.
      </p>
      <a href={passwordHref} className={`mt-1 inline-block ${LINK}`}>
        Change your password
      </a>
    </div>
  );
}

export function AccountPanel({
  view,
  profile,
  options,
  action,
  passwordHref,
}: Pick<
  NannySettingsProps,
  "view" | "profile" | "options" | "action" | "passwordHref"
>) {
  return (
    <div className="mt-4 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          How we reach you
        </h3>
        <div className="mt-2">
          <NannyContactPanel
            action={action}
            profile={profile}
            options={options}
            stepIndex={view.contactStepIndex}
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900">Your checks</h3>
        <p className="mt-1 text-sm text-slate-700" role="status">
          {view.verification.line}
        </p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {view.verificationRows.map((row) => (
            <li key={row.section} data-section={row.section}>
              <span className="text-slate-900">{row.label}</span> —{" "}
              {row.statusLabel}
            </li>
          ))}
        </ul>
      </div>

      <Security passwordHref={passwordHref} />
    </div>
  );
}
