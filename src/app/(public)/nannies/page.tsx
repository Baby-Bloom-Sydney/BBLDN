// S-X-10 — browse nannies (04 §6.1). Thin by rule: the marketplace-safe read + who is looking → the screen.
import type { Metadata } from "next";
import { auth } from "@/modules/auth";
import { AREAS_SOURCE } from "@/modules/config/server";
import { FUNNEL_PATHS, matching } from "@/modules/matching";
import { BrowseNannies, publicPageMetadata } from "@/modules/public-site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = publicPageMetadata("/nannies");

export default async function BrowseNanniesPage() {
  const [nannies, session] = await Promise.all([
    matching.listPublicNannies(),
    auth.getSession(),
  ]);
  const viewer =
    session.ok && session.value?.role === "parent" ? "parent" : "guest";
  return (
    <main>
      <BrowseNannies
        nannies={nannies.ok ? nannies.value : []}
        failed={!nannies.ok}
        viewer={viewer}
        serviceAreaName={AREAS_SOURCE.serviceAreaName}
        matchmakingHref={FUNNEL_PATHS.onboarding}
      />
    </main>
  );
}
