"use client";
// The scroll-gated biometric notice (`10.01`; 07 §2.6; AGR-04): the notice opens, she scrolls to the end, the tick
// becomes available — and the three instants travel with the form as the evidence 02 §4.1 keeps. The notice
// states who processes the images and where (config disclosures) and that a person makes every decision
// (Art 22). With no current notice document the tick stays closed: nothing real before `10.01` (kickoff §6).
import { useId, useRef, useState } from "react";
import type { BiometricNotice, WizardOptions } from "../../types";
import { FIELD_STYLES } from "./field-styles";

const stamp = () => new Date().toISOString();

export function BiometricNoticePanel({
  notice,
  disclosures,
  invalid,
}: {
  readonly notice: BiometricNotice | null;
  readonly disclosures: WizardOptions["disclosures"];
  readonly invalid?: boolean;
}) {
  const id = useId();
  const [openedAt] = useState(stamp);
  const [scrolledAt, setScrolledAt] = useState<string | null>(null);
  const [enabledAt, setEnabledAt] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const onScroll = (): void => {
    const el = bodyRef.current;
    if (el === null || scrolledAt !== null) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
      const at = stamp();
      setScrolledAt(at);
      setEnabledAt(at);
    }
  };
  const canTick = notice !== null && enabledAt !== null;

  return (
    <fieldset className="space-y-3">
      <legend className={FIELD_STYLES.label}>Your identity photos</legend>
      <p className="text-sm text-slate-700">
        Your document and selfie are used only to confirm who you are. Images
        are processed by <strong>{disclosures.aiProvider}</strong> in{" "}
        <strong>{disclosures.location}</strong>, and a person reviews every
        decision — nothing is decided by a machine alone. You can withdraw at
        any time from your settings, and the images are deleted once the check
        is settled.
      </p>
      {notice === null ? (
        <p className={FIELD_STYLES.note} role="status">
          The biometric notice isn&rsquo;t available yet, so this step is closed
          for now. Come back once it&rsquo;s published.
        </p>
      ) : (
        <div
          ref={bodyRef}
          onScroll={onScroll}
          tabIndex={0}
          role="region"
          aria-labelledby={`${id}-notice-heading`}
          className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700"
        >
          <h3
            id={`${id}-notice-heading`}
            className="font-medium text-slate-900"
          >
            Biometric notice (version {notice.version})
          </h3>
          {notice.body.split(/\n\s*\n/).map((paragraph, index) => (
            <p key={index} className="mt-2 whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>
      )}
      <p className={FIELD_STYLES.hint} role="status" aria-live="polite">
        {notice === null
          ? ""
          : scrolledAt === null
            ? "Read to the end to continue."
            : "Thanks — you can tick the box now."}
      </p>
      <input type="hidden" name="noticeOpenedAt" value={openedAt} />
      <input
        type="hidden"
        name="noticeScrollCompletedAt"
        value={scrolledAt ?? ""}
      />
      <input type="hidden" name="checkboxesEnabledAt" value={enabledAt ?? ""} />
      <label className={FIELD_STYLES.choice}>
        <input
          type="checkbox"
          name="consent"
          value="on"
          disabled={!canTick}
          aria-invalid={invalid === true ? true : undefined}
          className="mt-0.5"
        />
        <span>
          I have read the notice and I consent to my identity document and
          selfie being used to confirm who I am.
        </span>
      </label>
    </fieldset>
  );
}
