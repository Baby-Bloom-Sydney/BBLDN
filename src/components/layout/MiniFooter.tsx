"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
// The pure path predicate is reached at its leaf, **not** through the `public-site` connector barrel: this file
// is a client component, and that barrel re-exports screens which import `matching`'s connector, which reaches
// `auth`'s — whose module-level binding is the real Supabase inside and pulls the `server-only` service-role
// client into whatever bundle reaches it (07 §7 item 3). A client bundle never reaches a connector barrel
// (`auth/index.ts`: "the action is passed to the client component as a prop so the client bundle never reaches
// the connector barrel"). Pinned by `src/__tests__/client-server-boundary.test.ts`.
import { isPublicSitePath } from "@/modules/public-site/lib/is-public-site-path";

const HIDDEN_PATHS = [
  "/parent/request",
  "/matchmaking/onboarding",
  "/bb/test/onboarding-verification",
  "/nanny/onboarding-verification",
  // T-022 — same hide-footer treatment as the verification flow.
  "/nanny/onboarding/add-child",
  "/apply",
];

// useSearchParams forces the closest Suspense boundary to client-render;
// wrapping the body in our own Suspense localises that cost to the footer
// rather than bailing every page out of static optimisation.
function MiniFooterInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Headless funnel: parallel to LandingHeader. See T-039 Slice B.
  const funnelSrc = searchParams.get("src");
  if (funnelSrc === "std" || funnelSrc === "adv") return null;

  if (HIDDEN_PATHS.some((p) => pathname.startsWith(p))) return null;

  // The `(public)` group renders its own footer (public-site, 01.03).
  if (isPublicSitePath(pathname)) return null;

  return (
    <div className="flex justify-center gap-3 text-[10px] text-slate-400 py-3">
      <Link href="/about" className="hover:underline">
        About
      </Link>
      <Link href="/legal/privacy-policy" className="hover:underline">
        Privacy Policy
      </Link>
      <Link href="/legal/client-terms" className="hover:underline">
        Terms and Conditions
      </Link>
    </div>
  );
}

export function MiniFooter() {
  return (
    <Suspense fallback={null}>
      <MiniFooterInner />
    </Suspense>
  );
}
