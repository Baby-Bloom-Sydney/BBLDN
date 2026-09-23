// 04 §2.1 — the public screen register as a value, with each screen's metadata copy (05 §8.3: unique title +
// description per live S-X page) and its index rule (05 §8.3: S-X-08 · S-X-09 · S-X-13 · S-X-14 · S-X-15 … 19 are
// `noindex`). Robots and the sitemap are generated from this table, never hand-written (05 §8.3, §10).
// Brand from `config` (L4); paths are routes, not config.
import { BRAND, URLS } from "@/modules/config";
import type { PublicRoute } from "../types";

const legal = URLS.paths.legal;

export const PUBLIC_ROUTES: ReadonlyArray<PublicRoute> = Object.freeze([
  {
    id: "S-X-01",
    path: "/",
    group: "public",
    title: `${BRAND.longName} — verified nannies for London families`,
    description: `Tell us your days, your times and your area. ${BRAND.name} matches you with verified, DBS-checked nannies near you — then your matchmaker calls to introduce you to your top nannies.`,
    index: true,
    absoluteTitle: true,
  },
  {
    id: "S-X-02",
    path: "/results",
    group: "funnel",
    title: "Nannies near you",
    description:
      "Verified nannies near your area, matched to the days and times you need.",
    index: true,
  },
  {
    id: "S-X-03",
    path: "/matchmaking/onboarding",
    group: "funnel",
    title: "Create your position to connect with nannies",
    description:
      "A few short questions about your family, your area and your hours.",
    index: true,
  },
  {
    id: "S-X-04",
    path: "/matchmaking/results",
    group: "funnel",
    title: "Your top nannies",
    description: "The nannies matched to your family, ready to introduce.",
    index: true,
  },
  {
    id: "S-X-05",
    path: "/matchmaking/signup",
    group: "funnel",
    title: "Create your account",
    description:
      "Create your account beside your matches. Your matchmaker will call to introduce you to your top nannies.",
    index: true,
  },
  {
    id: "S-X-06",
    path: "/signup",
    group: "auth",
    title: "Create your account",
    description: `Create your ${BRAND.name} account. Your matchmaker will call to introduce you to your top nannies.`,
    index: true,
  },
  {
    id: "S-X-08",
    path: "/login",
    group: "auth",
    title: "Sign in",
    description: `Sign in to ${BRAND.name}.`,
    index: false,
  },
  {
    id: "S-X-09",
    path: "/forgot-password",
    group: "auth",
    title: "Reset your password",
    description: `Reset or set your ${BRAND.name} password.`,
    index: false,
  },
  {
    id: "S-X-10",
    path: "/nannies",
    group: "public",
    title: "Browse verified nannies in London",
    description: `Every nanny on ${BRAND.name} is identity-checked and holds an Enhanced DBS. Browse the nannies near you.`,
    index: true,
  },
  {
    id: "S-X-11",
    path: "/nannies/[id]",
    prefix: "/nannies/",
    group: "public",
    title: "Nanny profile",
    description: `A verified ${BRAND.name} nanny's profile.`,
    index: true,
  },
  {
    id: "S-X-15",
    path: "/apply",
    group: "funnel",
    title: "Apply to join",
    description: `Apply to join ${BRAND.name} London as a nanny.`,
    index: false,
  },
  {
    id: "S-X-20",
    path: "/about",
    group: "public",
    title: "About",
    description: `The early years shape everything that follows. Why ${BRAND.name} exists, and how we choose the nannies we introduce to London families.`,
    index: true,
  },
  {
    id: "S-X-21",
    path: "/how-it-works",
    group: "public",
    title: "How it works",
    description: `From your first answers to your matchmaker's call: how a London family finds its nanny with ${BRAND.name}.`,
    index: true,
  },
  {
    id: "S-X-22",
    path: "/pricing",
    group: "public",
    title: "Our service",
    description: `Verified, development-focused nannies matched to your family, with a matchmaker who calls to introduce you and arranges the meetings.`,
    index: true,
  },
  {
    id: "S-X-23",
    path: URLS.paths.support,
    group: "public",
    title: "Contact us",
    description: `Questions about ${BRAND.name}, your account or a nanny? Send us a message — we reply within one working day, London time.`,
    index: true,
  },
  {
    id: "S-X-24",
    path: "/childcare-professionals",
    group: "public",
    title: `Nannies — join ${BRAND.longName}`,
    description:
      "Work with London families who value early development. Enhanced DBS and right-to-work checks, then families matched to you.",
    index: true,
  },
  {
    id: "S-X-25",
    path: legal.privacy,
    prefix: "/legal/",
    group: "public",
    title: "Privacy policy",
    description: `How ${BRAND.longName} handles your data.`,
    index: true,
  },
  {
    id: "S-X-25",
    path: legal.clientTerms,
    group: "public",
    title: "Client terms",
    description: `The terms for families using ${BRAND.longName}.`,
    index: true,
  },
  {
    id: "S-X-25",
    path: legal.professionalTerms,
    group: "public",
    title: "Professional terms",
    description: `The terms for nannies using ${BRAND.longName}.`,
    index: true,
  },
  {
    id: "S-X-25",
    path: legal.codeOfConduct,
    group: "public",
    title: "Code of conduct",
    description: `The code of conduct for ${BRAND.longName}.`,
    index: true,
  },
  {
    id: "S-X-25",
    path: legal.cookies,
    group: "public",
    title: "Cookie policy",
    description: `How ${BRAND.longName} uses cookies.`,
    index: true,
  },
  {
    id: "S-X-25",
    path: legal.biometricNotice,
    group: "public",
    title: "Biometric notice — professionals",
    description: `The biometric notice for nannies verifying with ${BRAND.longName}.`,
    index: true,
  },
  // `/legal/biometric-notice-client` was here and is gone (L-009 `3b`). ADR-071 makes biometric verification
  // nanny-only: `0026` seeds one biometric notice — the professional's — and no client equivalent, which is why
  // `purpose-for-agreement.ts` maps `AGR-03` to nothing. The page was Sydney's and it was `index: true`, so it
  // was an indexed public promise of a document London does not have. Pointing it at the professional's notice
  // would publish a document written for somebody else; leaving Sydney's body is what this unit exists to end.
  // Removing the row takes it out of the robots file and the sitemap too, both generated from this table.
  {
    id: "S-X-25",
    path: legal.disclaimer,
    group: "public",
    title: "Legal and contact details",
    description: `Legal and contact details for ${BRAND.longName}.`,
    index: true,
  },
]);
