"use client";
// `/nanny/onboarding-verification` — S-N-03 → S-N-08 (04 §4.1 rows 9–13; 04 §6.3). The orchestrator holds the
// step and the state; each step's form submits to its action and the answer moves the section; "I'll verify
// later" is on every step; a suspended account sees one line and nothing else (I-V5). Resume (`03.21`) is the
// route's: `initialStep` arrives computed.
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  SectionState,
  VerificationState,
  VerificationWizardProps,
} from "../types";
import { WIZARD_STEPS } from "../lib/wizard-steps";
import { AccountSecuredStep } from "./wizard/AccountSecuredStep";
import { ContactStep } from "./wizard/ContactStep";
import { DbsStep } from "./wizard/DbsStep";
import { FIELD_STYLES } from "./wizard/field-styles";
import { IdentityStep } from "./wizard/IdentityStep";
import { ProcessingStep } from "./wizard/ProcessingStep";
import { RightToWorkStep } from "./wizard/RightToWorkStep";
import { StepForm } from "./wizard/StepForm";
import { WizardStepFrame } from "./wizard/WizardStepFrame";

const COUNT = WIZARD_STEPS.length - 1;

const withSection = (
  state: VerificationState | null,
  section: SectionState,
): VerificationState | null =>
  state === null
    ? null
    : {
        ...state,
        sections: state.sections.map((entry) =>
          entry.section === section.section ? section : entry,
        ),
      };

export function VerificationWizard(props: VerificationWizardProps) {
  const router = useRouter();
  const [index, setIndex] = useState(props.initialStep);
  const [state, setState] = useState(props.state);
  const step = WIZARD_STEPS[index];
  if (step === undefined) return null;
  const advance = (value: unknown): void => {
    setState((current) => withSection(current, value as SectionState));
    setIndex((current) => Math.min(current + 1, WIZARD_STEPS.length - 1));
  };

  if (state?.suspended)
    return (
      <section className="py-8">
        <h1 className="text-2xl font-bold text-slate-900">
          Your account is on hold
        </h1>
        <p className="mt-2 text-sm text-slate-700">
          We can&rsquo;t take documents right now. If you think this is a
          mistake, contact us and a person will look into it.
        </p>
        <a
          href={props.hrefs.hub}
          className={`mt-4 inline-block ${FIELD_STYLES.link}`}
        >
          Back to your hub
        </a>
      </section>
    );

  const frame = (children: React.ReactNode) => (
    <WizardStepFrame
      position={index}
      count={COUNT}
      heading={step.heading}
      laterHref={props.hrefs.hub}
    >
      {children}
    </WizardStepFrame>
  );

  switch (step.screen) {
    case "S-N-03":
      return frame(<AccountSecuredStep onStart={() => setIndex(1)} />);
    case "S-N-04":
      return frame(
        <StepForm
          action={props.actions.contact}
          onDone={advance}
          submitLabel="Save and go on"
        >
          {(badField) => (
            <ContactStep
              prefill={props.prefill}
              locationField={props.locationField}
              badField={badField}
            />
          )}
        </StepForm>,
      );
    case "S-N-05":
      return frame(
        <StepForm
          action={props.actions.identity}
          onDone={advance}
          submitLabel="Send my document and selfie"
        >
          {(badField) => (
            <IdentityStep
              options={props.options}
              prefill={props.prefill}
              notice={props.notice}
              badField={badField}
            />
          )}
        </StepForm>,
      );
    case "S-N-06":
      return frame(
        <StepForm
          action={props.actions.dbs}
          onDone={advance}
          submitLabel="Send my certificate"
        >
          {(badField) => (
            <DbsStep options={props.options} badField={badField} />
          )}
        </StepForm>,
      );
    case "S-N-07":
      return frame(
        <StepForm
          action={props.actions.rightToWork}
          onDone={advance}
          submitLabel="Send my evidence"
        >
          {(badField) => (
            <RightToWorkStep options={props.options} badField={badField} />
          )}
        </StepForm>,
      );
    default:
      return frame(
        <ProcessingStep
          action={props.actions.process}
          options={props.options}
          onDone={() => router.push(props.hrefs.status)}
        />,
      );
  }
}
