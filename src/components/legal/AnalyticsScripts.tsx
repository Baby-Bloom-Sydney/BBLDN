// The one file allowed to mount an analytics loader, and it is only ever rendered inside `ConsentGate`
// (L-009 `3g`; ADR-175 (a), (c)).
//
// **What this fixes.** `app/layout.tsx` mounted `<Analytics />` unconditionally, on every page, for every
// visitor — including one who had not been asked yet and one who had pressed Reject. ADR-175 (a) lists what is
// strictly necessary and the list is Supabase auth, the cookie-preference cookie and Vercel **routing**; product
// analytics is not on it, and "cookieless" is not the test PECR applies — reg 6 is about storing or accessing
// anything on a person's device, and a loader fetched and run on her device before she has answered is the thing
// the banner exists to ask about. So it moves behind the analytics choice, which is also the only reading under
// which the banner's Reject button means anything.
//
// Nothing marketing-shaped lives here, and nothing ever should: the Meta pixel landed with `4c` in its own
// file, `MetaPixel.tsx`, behind `<ConsentGate category="marketing">` — a different category, a different
// consent, a different file. `consent-gate.repo.test.ts` is the gate that makes that the only option rather
// than the recommended one.
import { Analytics } from "@vercel/analytics/next";

export function AnalyticsScripts() {
  return <Analytics />;
}
