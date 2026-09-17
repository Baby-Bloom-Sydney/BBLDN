"use client";
// S-X-15 → S-X-19 `/apply`, and S-N-19 `/nanny/apply` in `portal` mode (04 §4.1 rows 1–7; ADR-147). The
// orchestrator holds the answers in the browser until the page that writes them (04 §4.1 row 1): N1's four
// pages collect, the contact page submits the application (page 8), the portfolio and review pages patch the
// lead, the account page creates the account. In `portal` mode there is no contact and no account page — the
// review page submits everything to `applyFromPortal`. Stops (outside London · no DBS) replace the step.
import { useState } from "react";
import { FUNNEL_OPTIONS } from "../lib/funnel-options";
import { FUNNEL_STEPS } from "../lib/funnel-steps";
import type {
  FunnelStepId,
  FunnelStopKind,
  NannyApplyFunnelProps,
} from "../types";
import { AccountFields } from "./funnel/AccountStep";
import { ContactStep } from "./funnel/ContactStep";
import { CredentialsStep } from "./funnel/CredentialsStep";
import { ExperienceStep } from "./funnel/ExperienceStep";
import { FIELD_STYLES } from "./funnel/field-styles";
import { FunnelStepFrame } from "./funnel/FunnelStepFrame";
import { InterstitialStep } from "./funnel/InterstitialStep";
import { LocationStep } from "./funnel/LocationStep";
import { PortfolioStep } from "./funnel/PortfolioStep";
import { ResidencyStep } from "./funnel/ResidencyStep";
import { ReviewStep } from "./funnel/ReviewStep";
import { StepForm } from "./funnel/StepForm";
import { StopStep } from "./funnel/StopStep";

type Answers = Readonly<Record<string, string | ReadonlyArray<string>>>;

/** The N1 answers that travel as hidden fields with every later submit. */
const N1_FIELDS = [
  "district",
  "area",
  "rtwStatus",
  "hasEnhancedDbs",
  "yearsExperience",
  "ageGroups",
] as const;
const N3_FIELDS = ["roleTypes", "availability", "rateMin", "rateMax"] as const;

const merge = (answers: Answers, form: FormData): Answers => {
  const next: Record<string, string | ReadonlyArray<string>> = { ...answers };
  for (const key of new Set(form.keys())) {
    const all = form.getAll(key).map(String);
    next[key] = all.length > 1 ? all : (all[0] ?? "");
  }
  return next;
};

const pick = (answers: Answers, keys: ReadonlyArray<string>): Answers =>
  Object.fromEntries(
    keys
      .filter((key) => key in answers)
      .map((key) => [key, answers[key] as string | ReadonlyArray<string>]),
  );

const label = (
  list: ReadonlyArray<{ readonly key: string; readonly label: string }>,
  keys: string | ReadonlyArray<string> | undefined,
): string =>
  (typeof keys === "string" ? [keys] : (keys ?? []))
    .map((key) => list.find((option) => option.key === key)?.label ?? key)
    .join(", ");

export function NannyApplyFunnel(props: NannyApplyFunnelProps) {
  const steps = FUNNEL_STEPS[props.mode];
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [stop, setStop] = useState<FunnelStopKind | null>(null);
  const [signInInstead, setSignInInstead] = useState(false);
  const step = steps[index];
  if (step === undefined) return null;

  const advance = (): void =>
    setIndex((current) => Math.min(current + 1, steps.length - 1));
  const restart = (): void => {
    setAnswers({});
    setIndex(0);
  };
  const collect = (form: FormData): void =>
    setAnswers((current) => merge(current, form));
  const onCollected = (id: FunnelStepId) => (): void => {
    if (id === "credentials" && answers.hasEnhancedDbs === "no")
      setStop("no-dbs");
    else advance();
  };

  if (stop !== null)
    return <StopStep kind={stop} onBack={() => setStop(null)} />;

  const frame = (children: React.ReactNode) => (
    <FunnelStepFrame
      position={index + 1}
      count={steps.length}
      heading={step.heading}
    >
      {children}
    </FunnelStepFrame>
  );
  const area = String(answers.area ?? "");
  const summary = [
    ["Area", `${area}, ${String(answers.district ?? "")}`],
    ["Right to work", label(FUNNEL_OPTIONS.rtwStatus, answers.rtwStatus)],
    ["Experience", `${String(answers.yearsExperience ?? "")} years`],
    ["Ages", label(FUNNEL_OPTIONS.ageGroups, answers.ageGroups)],
    ["Work", label(FUNNEL_OPTIONS.roleTypes, answers.roleTypes)],
    [
      "Rate",
      `${props.options.currency} ${String(answers.rateMin ?? "")}–${String(answers.rateMax ?? "")} an hour`,
    ],
  ] as const;

  switch (step.id) {
    case "location":
      return frame(
        <StepForm
          onCollect={collect}
          onDone={onCollected("location")}
          submitLabel="Next"
        >
          <LocationStep
            areasApi={props.options.areasApi}
            onOutsideLondon={() => setStop("outside-london")}
          />
        </StepForm>,
      );
    case "residency":
      return frame(
        <StepForm
          onCollect={collect}
          onDone={onCollected("residency")}
          submitLabel="Next"
        >
          <ResidencyStep defaultValue={String(answers.rtwStatus ?? "")} />
        </StepForm>,
      );
    case "credentials":
      return frame(
        <StepForm
          onCollect={(form) => {
            collect(form);
            if (form.get("hasEnhancedDbs") === "no") setStop("no-dbs");
          }}
          onDone={() =>
            answers.hasEnhancedDbs === "no" ? undefined : advance()
          }
          submitLabel="Next"
        >
          <CredentialsStep
            defaultValue={String(answers.hasEnhancedDbs ?? "")}
          />
        </StepForm>,
      );
    case "experience":
      return frame(
        <StepForm
          onCollect={collect}
          onDone={onCollected("experience")}
          submitLabel="Next"
        >
          <ExperienceStep
            defaultYears={String(answers.yearsExperience ?? "")}
            defaultGroups={
              answers.ageGroups as ReadonlyArray<string> | undefined
            }
          />
        </StepForm>,
      );
    case "contact":
      return frame(
        signInInstead ? (
          <div className="space-y-3 text-sm text-slate-700" role="status">
            <p>That email already has an account with us.</p>
            <a href={props.signInHref} className={FIELD_STYLES.link}>
              Sign in instead
            </a>
          </div>
        ) : (
          <StepForm
            action={props.actions.application}
            hidden={pick(answers, N1_FIELDS)}
            onCollect={collect}
            onDone={(value) =>
              (value as { next?: string })?.next === "sign-in"
                ? setSignInInstead(true)
                : advance()
            }
            submitLabel="Send my application"
          >
            <ContactStep />
          </StepForm>
        ),
      );
    case "interstitial":
      return frame(
        <StepForm onDone={advance} submitLabel="Next">
          <InterstitialStep
            firstName={String(
              answers.firstName ?? props.prefill?.firstName ?? "",
            )}
          />
        </StepForm>,
      );
    case "portfolio":
      return frame(
        <StepForm
          {...(props.mode === "apply"
            ? { action: props.actions.portfolio }
            : {})}
          onCollect={collect}
          onDone={advance}
          onRestart={restart}
          submitLabel="Next"
        >
          <PortfolioStep currency={props.options.currency} />
        </StepForm>,
      );
    case "review":
      return frame(
        <StepForm
          action={
            props.mode === "apply"
              ? props.actions.bio
              : props.actions.applyFromPortal
          }
          hidden={
            props.mode === "apply"
              ? {}
              : pick(answers, [...N1_FIELDS, ...N3_FIELDS])
          }
          onCollect={collect}
          onDone={(value) =>
            props.mode === "apply"
              ? advance()
              : window.location.assign(
                  (value as { destination: string }).destination,
                )
          }
          onRestart={restart}
          submitLabel={props.mode === "apply" ? "Looks right" : "Apply to join"}
        >
          <ReviewStep area={area} summary={summary} />
        </StepForm>,
      );
    case "account":
      return frame(
        <StepForm
          action={props.actions.signup}
          hidden={{ path: "apply" }}
          onDone={(value) =>
            window.location.assign(
              (value as { destination: string }).destination,
            )
          }
          onRestart={restart}
          submitLabel="Create my account"
        >
          <AccountFields
            minPasswordLength={props.options.minPasswordLength}
            professionalTermsHref={props.professionalTermsHref}
            privacyHref={props.privacyHref}
          />
        </StepForm>,
      );
  }
}
