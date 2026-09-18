// S-N-17 `/nanny/profile` (`03.22` Rejig; 04 §6.3 "complete · incomplete → S-N-18"). Server component; every
// href is a prop and every word comes from `nannyProfileView` — this file decides nothing.
//
// Two things the screen is, and one it is not. It is **what a family reads about her**, so each fact carries an
// edit link into S-N-18 at the step that owns it. It is **her own completeness and her own next step**, named by
// the step's own heading so the words match the screen she lands on. It is **not** a place that says anything
// about a hold: the verification block is `nannyVerificationSummary`'s output, whose whole input is her level
// and her four section statuses (ADR-157 — the hold has no copy anywhere).
import type { NannyMyProfileProps } from "../types";

const TILE = "rounded-lg border border-slate-200 bg-white p-4";
const LINK =
  "text-sm font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900";

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function Availability({
  availability,
  editHref,
}: {
  readonly availability: NannyMyProfileProps["view"]["availability"];
  readonly editHref: string;
}) {
  return (
    <section aria-labelledby="availability-heading" className={TILE}>
      <h2 id="availability-heading" className="font-medium text-slate-900">
        When you&rsquo;re available
      </h2>
      {availability === null ? (
        <p className="mt-1 text-sm text-slate-600">Not given yet.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {DAYS.filter((day) => (availability[day] ?? []).length > 0).map(
            (day) => (
              <li key={day}>
                <span className="capitalize">{day}</span> —{" "}
                {(availability[day] ?? []).join(", ")}
              </li>
            ),
          )}
        </ul>
      )}
      <a href={editHref} className={`mt-2 inline-block ${LINK}`}>
        Edit
      </a>
    </section>
  );
}

function Verification({
  verification,
  verificationHref,
}: {
  readonly verification: NannyMyProfileProps["view"]["verification"];
  readonly verificationHref: string;
}) {
  return (
    <section
      aria-labelledby="verification-heading"
      className={TILE}
      data-level={verification.level}
    >
      <h2 id="verification-heading" className="font-medium text-slate-900">
        Your checks
      </h2>
      <p className="mt-1 text-sm text-slate-700" role="status">
        {verification.line}
      </p>
      <ul className="mt-3 space-y-1 text-sm text-slate-600">
        {verification.rows.map((row) => (
          <li key={row.section} data-section={row.section}>
            <span className="text-slate-900">{row.label}</span> —{" "}
            {row.statusLabel}
          </li>
        ))}
      </ul>
      {verification.needsHer && (
        <a href={verificationHref} className={`mt-2 inline-block ${LINK}`}>
          Fix it now
        </a>
      )}
    </section>
  );
}

function NextStep({
  view,
  editHref,
}: {
  readonly view: NannyMyProfileProps["view"];
  readonly editHref: string;
}) {
  if (view.nextStep === null)
    return (
      <p className={`${TILE} text-sm text-slate-700`} role="status">
        Your profile is complete — this is what a family reads when we introduce
        you.
      </p>
    );
  return (
    <section aria-labelledby="next-heading" className={TILE}>
      <h2 id="next-heading" className="font-medium text-slate-900">
        Next: {view.nextStep.label}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        {view.missing.length === 1
          ? "One thing left, and your profile goes in front of families."
          : `${String(view.missing.length)} things left, and your profile goes in front of families.`}
      </p>
      <a
        href={`${editHref}?step=${String(view.nextStep.stepIndex)}`}
        className="mt-3 inline-flex items-center rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
      >
        Carry on
      </a>
    </section>
  );
}

function Facts({
  facts,
  editHref,
}: {
  readonly facts: NannyMyProfileProps["view"]["facts"];
  readonly editHref: string;
}) {
  return (
    <section aria-labelledby="about-heading" className={TILE}>
      <h2 id="about-heading" className="font-medium text-slate-900">
        What a family reads
      </h2>
      <dl className="mt-3 space-y-3">
        {facts.map((fact) => (
          <div key={fact.id}>
            <dt className="text-sm font-medium text-slate-900">{fact.label}</dt>
            <dd className="text-sm text-slate-600">
              {fact.value ?? "Not given yet."}{" "}
              <a
                href={`${editHref}?step=${String(fact.stepIndex)}`}
                className={LINK}
              >
                Edit
              </a>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The availability step's index in `PROFILE_STEPS` — the one edit link that is not on a fact row. */
const AVAILABILITY_STEP = 7;

export function NannyMyProfile({
  view,
  editHref,
  verificationHref,
  hubHref,
  settingsHref,
}: NannyMyProfileProps) {
  return (
    <div className="space-y-6" data-complete={String(view.complete)}>
      <header>
        <h1 className="text-2xl font-bold [letter-spacing:-0.025em] text-slate-900">
          Your profile
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {view.areaLine ?? "Tell us where in London you are"}
          {view.rateLine === null ? "" : ` · ${view.rateLine}`}
        </p>
      </header>

      <NextStep view={view} editHref={editHref} />

      <Verification
        verification={view.verification}
        verificationHref={verificationHref}
      />

      <Facts facts={view.facts} editHref={editHref} />

      <Availability
        availability={view.availability}
        editHref={`${editHref}?step=${String(AVAILABILITY_STEP)}`}
      />

      <nav aria-label="Your account" className="flex flex-wrap gap-4 text-sm">
        <a href={hubHref} className={LINK}>
          Back to your hub
        </a>
        <a href={settingsHref} className={LINK}>
          Settings
        </a>
      </nav>
    </div>
  );
}
