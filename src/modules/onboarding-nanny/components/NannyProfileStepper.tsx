"use client";
// S-N-18 `/nanny/register` (04 §6.3): the ten-step profile completion — "position in the h1, `aria-current`,
// focus to the new step heading; fields already held are prefilled". Each step is one server-action submit; the
// answer says the next step and whether the profile is complete (`03.18`). Done → S-N-17.
import { useState } from "react";
import { PROFILE_STEPS } from "../lib/profile-steps";
import type {
  NannyProfileStepOutcome,
  NannyProfileStepperProps,
} from "../types";
import { FunnelStepFrame } from "./funnel/FunnelStepFrame";
import { StepForm } from "./funnel/StepForm";
import { ProfileStepFields } from "./profile/ProfileStepFields";

export function NannyProfileStepper(props: NannyProfileStepperProps) {
  const [index, setIndex] = useState(
    Math.min(Math.max(props.step, 0), PROFILE_STEPS.length - 1),
  );
  const step = PROFILE_STEPS[index];
  if (step === undefined) return null;
  const last = index === PROFILE_STEPS.length - 1;
  return (
    <FunnelStepFrame
      position={index + 1}
      count={PROFILE_STEPS.length}
      heading={step.heading}
    >
      <StepForm
        key={step.id}
        action={props.action}
        hidden={{ step: String(index) }}
        onDone={(value) => {
          const outcome = value as NannyProfileStepOutcome;
          if (outcome.next === null) window.location.assign(props.doneHref);
          else setIndex(outcome.next);
        }}
        submitLabel={last ? "Finish" : "Save and continue"}
      >
        <ProfileStepFields
          id={step.id}
          profile={props.profile}
          options={props.options}
        />
      </StepForm>
    </FunnelStepFrame>
  );
}
