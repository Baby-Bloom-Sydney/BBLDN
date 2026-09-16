// S-X-01 — home with the quick-match front door (04 §6.1). Thin by rule (05 §7 rule 5).
import type { Metadata } from "next";
import { AREAS_SOURCE } from "@/modules/config/server";
import {
  HomeHero,
  HomeNannyInvite,
  HomeSteps,
  JsonLd,
  publicPageMetadata,
  websiteJsonLd,
} from "@/modules/public-site";

export const metadata: Metadata = publicPageMetadata("/");

export default function HomePage() {
  return (
    <main>
      <JsonLd data={websiteJsonLd} />
      <HomeHero serviceAreaName={AREAS_SOURCE.serviceAreaName} />
      <HomeSteps />
      <HomeNannyInvite />
    </main>
  );
}
