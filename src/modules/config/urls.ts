// 01 §3.1 — every URL built from the one base (no second base URL: Sydney's NEXT_PUBLIC_SITE_URL /
// NEXT_PUBLIC_INVITE_BASE_URL do not exist). Paths are the legacy routes until 04 §2's register is applied (Phase 1a).
import { publicEnv } from "./public-env";

const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

export const URLS = Object.freeze({
  app: base,
  invite: `${base}/invite`,
  subscribeFor: `${base}/subscribe-for`,
  paths: Object.freeze({
    support: "/contact",
    legal: Object.freeze({
      privacy: "/legal/privacy-policy",
      clientTerms: "/legal/client-terms",
      professionalTerms: "/legal/professional-terms",
      cookies: "/legal/cookies",
      codeOfConduct: "/legal/code-of-conduct",
      biometricNotice: "/legal/biometric-notice",
      disclaimer: "/legal/disclaimer",
    }),
  }),
});
