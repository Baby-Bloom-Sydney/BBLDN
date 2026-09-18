"use client";
// S-N-21's Account → contact fields (04 §6.3). It is **S-N-18's own location step**, rendered here: the same
// `ProfileStepFields`, the same `saveNannyProfileStepAction`, the same `update_nanny_profile(p_contact)` behind
// it (`0021`; ADR-152 (2)), and therefore the same schema, the same refusals and the same 07 §8 row 16 ceiling.
//
// A second action for the same three fields would have been a second place for them to validate differently, and
// S-N-04 and S-N-18 already share this one. What settings adds is where it sits, not how it is written.
import { useState } from "react";
import type {
  NannyFunnelOptions,
  NannyProfile,
  NannyProfileStepAction,
} from "../../types";
import { ProfileStepFields } from "../profile/ProfileStepFields";
import { StepForm } from "../funnel/StepForm";

export function NannyContactPanel({
  action,
  profile,
  options,
  stepIndex,
}: {
  readonly action: NannyProfileStepAction;
  readonly profile: NannyProfile;
  readonly options: NannyFunnelOptions;
  readonly stepIndex: number;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <div>
      {saved && (
        <p role="status" className="mb-3 text-sm text-green-800">
          Saved.
        </p>
      )}
      <StepForm
        action={action}
        hidden={{ step: String(stepIndex) }}
        onDone={() => setSaved(true)}
        submitLabel="Save"
      >
        <ProfileStepFields id="location" profile={profile} options={options} />
      </StepForm>
    </div>
  );
}
