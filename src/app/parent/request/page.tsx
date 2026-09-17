// S-P-04 — `/parent/request` (04 §2.2, §6.2): the in-app position flow, the same question bank as S-X-03, for a
// parent who signed up cold, from a nanny profile, or from the quick match (04 §3.2 paths A · C · D). Completion
// opens the position (P-2), whose cascade opens the call, and the parent lands on S-P-01 — `03.36` / 04 §3.3
// trigger (b). Thin by rule (05 §7 rule 5): read the prefill, render, hand the action over.
//
// The form asks what the family needs and sells nothing: the paid path, the amounts and the guarantees are the
// call's (ADR-082 / 093; 04 §3.1 step 13, D2) and belong on no pre-call screen.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, loginRedirectUrl } from "@/modules/auth";
import {
  AGE_LABELS,
  WIZARD_QUESTIONS,
  Wizard,
  matching,
} from "@/modules/matching";
import type { WizardAnswers } from "@/modules/matching";
import { createPositionAction } from "@/modules/onboarding-parent";
import { parseQuickMatchQuery } from "@/modules/public-site";
import type { LeadId } from "@/modules/shared-types";

export const metadata: Metadata = {
  title: "Create your position",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** 04 §8, ratified: the one header S-P-04 and the T-1.8d landing share. */
const HEADER = "Create your position to connect with nannies";
const SUBMIT = "Create my position";
const ROUTE = "/parent/request";

type Props = {
  readonly searchParams: Readonly<
    Record<string, string | string[] | undefined>
  >;
};

const toSearchParams = (params: Props["searchParams"]): URLSearchParams => {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    for (const entry of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      out.append(key, entry);
  return out;
};

/** The prefill 04 §6.2 names: an existing lead's answers, else whatever the quick match already asked. */
async function prefill(params: Props["searchParams"]): Promise<WizardAnswers> {
  const lead = typeof params.lead === "string" ? (params.lead as LeadId) : null;
  if (lead !== null) {
    const stored = await matching.getLead(lead);
    if (stored.ok && stored.value !== null) return stored.value.answers;
  }
  const quick = parseQuickMatchQuery(toSearchParams(params));
  return {
    ...(quick.district === ""
      ? {}
      : {
          area: {
            area: quick.area || quick.district,
            district: quick.district,
          },
        }),
    ...(quick.days.length > 0 ? { days: quick.days } : {}),
    ...(quick.parts.length > 0 ? { parts: quick.parts } : {}),
  };
}

export default async function ParentPositionFlowPage({ searchParams }: Props) {
  const session = await auth.requireRole("parent");
  if (!session.ok) redirect(loginRedirectUrl(ROUTE));
  const answers = await prefill(searchParams);
  return (
    <main className="px-4 py-10">
      <Wizard
        questions={WIZARD_QUESTIONS}
        ageLabels={AGE_LABELS}
        initialAnswers={answers}
        leadId={session.value.userId}
        source={null}
        connectNannyId={null}
        header={HEADER}
        submitLabel={SUBMIT}
        onComplete={createPositionAction}
      />
    </main>
  );
}
