// `WebSite` structured data for S-X-01 (05 §8.3) — brand and base URL from `config` (L4).
import { BRAND, URLS } from "@/modules/config";

export const websiteJsonLd = Object.freeze({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: BRAND.longName,
  url: URLS.app,
});
