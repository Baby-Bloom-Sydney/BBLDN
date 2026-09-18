"use client";
// S-N-10 `/nanny/verify` (04 §6.3): the standalone biometric-notice consent page — the same scroll-gated panel
// and the same recorder as S-N-05's tick (stocktake 05 Q6: one mechanism, two entries). Done → S-N-09.
import { useRouter } from "next/navigation";
import type { BiometricNoticeConsentProps } from "../types";
import { BiometricNoticePanel } from "./wizard/BiometricNoticePanel";
import { FIELD_STYLES } from "./wizard/field-styles";
import { StepForm } from "./wizard/StepForm";

export function BiometricNoticeConsent(props: BiometricNoticeConsentProps) {
  const router = useRouter();
  return (
    <section aria-labelledby="notice-heading" className="py-8">
      <a href={props.hrefs.back} className={FIELD_STYLES.link}>
        Back
      </a>
      <h1
        id="notice-heading"
        className="mt-4 text-2xl font-bold [letter-spacing:-0.025em] text-slate-900"
      >
        Before we check your identity
      </h1>
      <div className="mt-6">
        <StepForm
          action={props.action}
          onDone={() => router.push(props.hrefs.next)}
          submitLabel="Record my consent"
        >
          {(badField) => (
            <BiometricNoticePanel
              notice={props.notice}
              disclosures={props.disclosures}
              invalid={badField === "consent"}
            />
          )}
        </StepForm>
      </div>
    </section>
  );
}
