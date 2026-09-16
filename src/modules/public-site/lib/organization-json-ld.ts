// 05 §8.3 — `Organization` on S-X-01 naming the UK company (ADR-072). The registered name and number are B-35
// (DECISIONS §2, not yet ruled), so the brand's long name stands in until config carries the entity line.
// `serviceAreaName` is `AREAS_SOURCE.serviceAreaName` (server-only config), handed in by the layout.
import { BRAND, URLS } from "@/modules/config";

export function organizationJsonLd(serviceAreaName: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND.longName,
    alternateName: BRAND.name,
    url: URLS.app,
    logo: `${URLS.app}/logo.png`,
    description: `${BRAND.longName} introduces London families to verified, development-focused nannies.`,
    areaServed: {
      "@type": "AdministrativeArea",
      name: serviceAreaName,
    },
  };
}
