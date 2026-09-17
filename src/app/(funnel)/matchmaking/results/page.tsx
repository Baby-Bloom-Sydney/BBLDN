// S-X-04 — pre-auth matches (04 §6.1). Thin by rule: the lead from the query → the page; missing → S-X-03.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  FUNNEL_PATHS,
  FunnelShell,
  PreAuthResults,
  buildPreAuthPage,
  connectAction,
} from "@/modules/matching";
import { parseFunnelQuery, publicPageMetadata } from "@/modules/public-site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = publicPageMetadata("/matchmaking/results");

type Props = {
  readonly searchParams: Readonly<
    Record<string, string | string[] | undefined>
  >;
};

export default async function MatchmakingResultsPage({ searchParams }: Props) {
  const { lead } = parseFunnelQuery(searchParams);
  const page = await buildPreAuthPage(lead);
  if (page.kind === "missing-lead") redirect(FUNNEL_PATHS.onboarding);
  return (
    <FunnelShell>
      <PreAuthResults
        page={page}
        connectAction={connectAction}
        retryHref={`${FUNNEL_PATHS.matches}?${FUNNEL_PATHS.query.lead}=${encodeURIComponent(lead ?? "")}`}
      />
    </FunnelShell>
  );
}
