// S-X-03 — the advanced wizard (04 §6.1). Thin by rule: prefill from the quick-match query or an existing lead,
// remember a guest Connect's nanny (T-1.8d), mint the lead id, render.
import type { Metadata } from "next";
import { newId } from "@/modules/platform";
import {
  AGE_LABELS,
  FunnelShell,
  WIZARD_QUESTIONS,
  Wizard,
  matching,
  saveParentLeadAction,
} from "@/modules/matching";
import type { WizardAnswers } from "@/modules/matching";
import {
  parseFunnelQuery,
  parseQuickMatchQuery,
  publicPageMetadata,
} from "@/modules/public-site";
import type { LeadId } from "@/modules/shared-types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = publicPageMetadata("/matchmaking/onboarding");

type Props = {
  readonly searchParams: Readonly<
    Record<string, string | string[] | undefined>
  >;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toSearchParams = (params: Props["searchParams"]): URLSearchParams => {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const entry of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      out.append(key, entry);
  }
  return out;
};

async function initialAnswers(
  params: Props["searchParams"],
  lead: LeadId | null,
): Promise<WizardAnswers> {
  if (lead !== null) {
    const stored = await matching.getLead(lead);
    if (stored.ok && stored.value !== null) return stored.value.answers;
  }
  const quick = parseQuickMatchQuery(toSearchParams(params));
  return {
    ...(quick.district !== ""
      ? {
          area: {
            area: quick.area || quick.district,
            district: quick.district,
          },
        }
      : {}),
    ...(quick.days.length > 0 ? { days: quick.days } : {}),
    ...(quick.parts.length > 0 ? { parts: quick.parts } : {}),
  };
}

export default async function OnboardingPage({ searchParams }: Props) {
  const { src, lead } = parseFunnelQuery(searchParams);
  const nanny =
    typeof searchParams.nanny === "string" && UUID.test(searchParams.nanny)
      ? searchParams.nanny
      : null;
  const answers = await initialAnswers(searchParams, lead);
  return (
    <FunnelShell>
      <Wizard
        questions={WIZARD_QUESTIONS}
        ageLabels={AGE_LABELS}
        initialAnswers={answers}
        leadId={lead ?? newId<LeadId>()}
        source={src}
        connectNannyId={nanny}
        saveAction={saveParentLeadAction}
      />
    </FunnelShell>
  );
}
