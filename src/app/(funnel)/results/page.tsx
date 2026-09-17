// S-X-02 — quick-match results (04 §6.1). Thin by rule (05 §7 rule 5): the front door's query → the page.
import type { Metadata } from "next";
import { AREAS_SOURCE } from "@/modules/config/server";
import {
  FunnelShell,
  QuickMatchResults,
  buildQuickMatchPage,
  connectAction,
} from "@/modules/matching";
import {
  parseQuickMatchQuery,
  publicPageMetadata,
} from "@/modules/public-site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = publicPageMetadata("/results");

type Props = {
  readonly searchParams: Readonly<
    Record<string, string | string[] | undefined>
  >;
};

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

export default async function ResultsPage({ searchParams }: Props) {
  const query = toSearchParams(searchParams);
  const input = parseQuickMatchQuery(query);
  const page = await buildQuickMatchPage(input);
  return (
    <FunnelShell>
      <QuickMatchResults
        page={page}
        connectAction={connectAction}
        serviceAreaName={AREAS_SOURCE.serviceAreaName}
        retryHref={`/results?${query}`}
      />
    </FunnelShell>
  );
}
