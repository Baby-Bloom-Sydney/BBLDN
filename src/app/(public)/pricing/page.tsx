// S-X-22 — the services page, plain: no amount on screen (04 §6.1). Thin by rule (05 §7 rule 5).
import type { Metadata } from "next";
import { AREAS_SOURCE } from "@/modules/config/server";
import {
  JsonLd,
  ServicesContent,
  publicPageMetadata,
  servicesFaqJsonLd,
} from "@/modules/public-site";

export const metadata: Metadata = publicPageMetadata("/pricing");

export default function ServicesPage() {
  return (
    <main>
      <JsonLd data={servicesFaqJsonLd(AREAS_SOURCE.serviceAreaName)} />
      <ServicesContent serviceAreaName={AREAS_SOURCE.serviceAreaName} />
    </main>
  );
}
