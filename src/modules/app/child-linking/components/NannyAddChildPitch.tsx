"use client";

// S-N-01 `/nanny/onboarding/add-child` (`03.19` Rejig; 04 §4.1 row 8, §4.4 c1; 04 §8 anchor "Get paid for
// adding existing clients.") — the contributions pitch and the mint that backs it.
//
// **What London removed** (ADR-099; N-2; 04 §6.3 S-N-01 — the Sydney bonus copy and its 30-day window): every
// amount, every bonus, every 30-day window, every payout. There is no figure on this screen and there will not
// be one until the money model sets it (D0.2). What replaces it is the truth she can act on — she brings a
// family she already works for, the terms are agreed with her by voice on a call, and the explainer is one
// link away (S-N-02).
//
// It is a client component for one reason: the form has three states (empty · the link · the refusal) and the
// link is the whole point of the screen, so it has to appear without a navigation that would lose it.
import { useFormState, useFormStatus } from "react-dom";
import type { NannyAddChildPitchProps } from "../types";
import { addFamilyChildAction } from "../actions/add-family-child-action";
import { addChildPitchCopy } from "../lib/add-child-pitch-copy";

const FIELD =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";
const LABEL = "block text-sm font-medium text-slate-900";
const LINK =
  "text-sm font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-md bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
    >
      {pending ? "Making your link…" : "Add this family"}
    </button>
  );
}

export function NannyAddChildPitch({
  commissionHref,
  skipHref,
  skipLabel,
  brandName,
  worksWithUnderThrees,
}: NannyAddChildPitchProps) {
  const [state, action] = useFormState(addFamilyChildAction, {
    url: null,
    error: null,
  });
  // kickoff debt 14 — the words follow the signal; the offer does not (see `add-child-pitch-copy.ts`).
  //
  // Nothing on this page carries the variant as data (`security-reviewer` LOW): `copy.variant` maps 1:1 to the
  // under-3 signal, which 04 §4.1 row 5 says is captured and **never shown to her**, so a `data-` attribute
  // holding it would put the signal in her own page source. The variant is asserted on the pure
  // `addChildPitchCopy` instead, where it belongs; the screen renders only the words.
  const copy = addChildPitchCopy(worksWithUnderThrees);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 md:py-14">
      <section aria-labelledby="add-child-heading">
        <h1
          id="add-child-heading"
          className="text-3xl font-bold leading-tight [letter-spacing:-0.02em] text-slate-900 md:text-4xl"
        >
          {copy.heading}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600">
          {copy.lead}
        </p>
        <p className="mt-3 text-base leading-relaxed text-slate-600">
          {copy.second}
        </p>
        <p className="mt-4">
          <a href={commissionHref} className={LINK}>
            How it works
          </a>
        </p>
      </section>

      <section
        aria-labelledby="add-family-heading"
        className="mt-10 rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2
          id="add-family-heading"
          className="text-lg font-semibold text-slate-900"
        >
          {copy.formHeading}
        </h2>
        {state.url === null ? (
          <form action={action} className="mt-4 space-y-5">
            {state.error !== null && (
              <p
                role="alert"
                className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                {state.error}
              </p>
            )}
            <div>
              <label htmlFor="firstName" className={LABEL}>
                The child&rsquo;s first name
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                required
                autoComplete="off"
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="dateOfBirth" className={LABEL}>
                Their date of birth
              </label>
              <input
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
                required
                className={FIELD}
              />
              <p className="mt-1 text-sm text-slate-600">
                We follow children up to their third birthday.
              </p>
            </div>
            <div className="flex gap-3">
              <input
                id="guardianPermission"
                name="guardianPermission"
                type="checkbox"
                required
                className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <label
                htmlFor="guardianPermission"
                className="text-sm text-slate-700"
              >
                I have this family&rsquo;s permission to add their child and to
                invite them to {brandName}. Only a parent or legal guardian can
                agree to their child being on the app.
              </label>
            </div>
            <Submit />
          </form>
        ) : (
          <div className="mt-4">
            <p
              role="status"
              className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
            >
              Your link is ready — send it to the family and they can set
              themselves up.
            </p>
            <p className="mt-3 break-all rounded-md border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-800">
              {state.url}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              The link stays the same, so you can send it again whenever suits.
            </p>
          </div>
        )}
      </section>

      <nav aria-label="What next" className="mt-8 flex flex-wrap gap-4">
        <a href={skipHref} className={LINK}>
          {skipLabel}
        </a>
        <a href={commissionHref} className={LINK}>
          Read how commission works
        </a>
      </nav>
    </main>
  );
}
