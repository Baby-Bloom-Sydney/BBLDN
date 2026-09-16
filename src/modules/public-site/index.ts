// public-site connector (01 §2.3) — the public surface. It may import `matching`, `connections` and the
// service modules; it never imports `scheduling` (03 §3.6 R3), and it reaches K-1 through the `connections`
// stage-model connector rather than writing a stage itself (B-39 open — the Connect action is not built).
//
// Client-safe by construction: no file here imports `@/modules/config/server` except the `"use server"` action,
// so a client component (the legacy MiniFooter) may import this barrel for `isPublicSitePath`.
export type * from "./types";

// The route register (04 §2.1) and what is generated from it (05 §8.3).
export { PUBLIC_ROUTES } from "./lib/public-routes";
export { isPublicSitePath } from "./lib/is-public-site-path";
export { publicPageMetadata } from "./lib/public-page-metadata";
export { rootMetadata } from "./lib/root-metadata";
export { buildRobots } from "./lib/build-robots";
export { buildSitemap } from "./lib/build-sitemap";

// Structured data (05 §8.3).
export { organizationJsonLd } from "./lib/organization-json-ld";
export { websiteJsonLd } from "./lib/website-json-ld";
export { servicesFaqJsonLd } from "./lib/services-faq-json-ld";

// The S-X-01 → S-X-02 query contract (04 §3.1 steps 1 → 2), read by `1b`.
export { parseQuickMatchQuery } from "./lib/parse-quick-match-query";

// S-X-23.
export { sendContactMessageAction } from "./actions/send-contact-message-action";

// Chrome + screens (01.02 · 01.03 · 01.09 · 01.10 · 01.12 · 01.13 · 01.14 · 01.15).
export { JsonLd } from "./components/JsonLd";
export { PublicHeader } from "./components/PublicHeader";
export { PublicFooter } from "./components/PublicFooter";
export { HomeHero } from "./components/HomeHero";
export { HomeSteps } from "./components/HomeSteps";
export { HomeNannyInvite } from "./components/HomeNannyInvite";
export { AboutContent } from "./components/AboutContent";
export { HowItWorksStub } from "./components/HowItWorksStub";
export { ServicesContent } from "./components/ServicesContent";
export { ContactContent } from "./components/ContactContent";
