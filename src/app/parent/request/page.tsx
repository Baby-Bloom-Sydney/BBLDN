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
  wizardAnswersOf,
} from "@/modules/matching";
import type { WizardAnswers } from "@/modules/matching";
import {
  amendPositionAction,
  createPositionAction,
} from "@/modules/onboarding-parent";
import { parentMayAmend, positions } from "@/modules/positions";
import type { PositionSummary } from "@/modules/positions";
import { parseQuickMatchQuery } from "@/modules/public-site";
import type { LeadId, ParentId } from "@/modules/shared-types";

export const metadata: Metadata = {
  title: "Create your position",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** 04 §8, ratified: the one header S-P-04 and the T-1.8d landing share. */
const HEADER = "Create your position to connect with nannies";
const SUBMIT = "Create my position";
/** 04 §6.2 — the screen's second state, "edit (no re-fire)": same bank, her answers already in it. */
const EDIT_HEADER = "Change what you asked for";
const EDIT_SUBMIT = "Save my changes";
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

/**
 * The position this parent already holds, when `amend` would still accept a change to it — which is the one
 * question that decides which of the screen's two states this is. A read that refuses answers `null`: the
 * screen then asks her to create one, and P-2's own I-1 refuses a second live position rather than this page
 * guessing. `canEdit` is `positions`' judgement (04 §6.2; `may-amend.ts`), never re-derived here.
 */
async function editable(userId: string): Promise<PositionSummary | null> {
  const live = await positions.findLive(userId as ParentId);
  if (!live.ok || live.value === null) return null;
  return parentMayAmend(live.value.stage) ? live.value : null;
}

export default async function ParentPositionFlowPage({ searchParams }: Props) {
  const session = await auth.requireRole("parent");
  if (!session.ok) redirect(loginRedirectUrl(ROUTE));
  const existing = await editable(session.value.userId as string);
  const answers =
    existing === null
      ? await prefill(searchParams)
      : wizardAnswersOf(existing.detail);
  return (
    <main className="px-4 py-10">
      <Wizard
        questions={WIZARD_QUESTIONS}
        ageLabels={AGE_LABELS}
        initialAnswers={answers}
        leadId={session.value.userId}
        source={null}
        connectNannyId={null}
        header={existing === null ? HEADER : EDIT_HEADER}
        submitLabel={existing === null ? SUBMIT : EDIT_SUBMIT}
        onComplete={
          existing === null ? createPositionAction : amendPositionAction
        }
      />
    </main>
  );
}
