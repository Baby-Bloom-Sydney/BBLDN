"use client";

// **The PECR gate, and it is JavaScript — not the CSP** (ADR-175 (c); 07 §10.3's "fix: S-10"; L-009 `3g`).
//
// 07 §10.3 is explicit that the Meta origins sit in the `script-src` allow-list **statically**, because a CSP
// that varied with consent would split the cache. So the allow-list is a ceiling on what *can* load and is not
// evidence of what *does*: the only thing that actually keeps a non-essential script out of the document before
// a person has chosen is a component that refuses to render it. This is that component.
//
// Three properties, each of which is a case in `ConsentGate.test.tsx`:
//
//   1. **It starts not-granted and stays that way through the server render.** `useState(false)` with the read
//      in an effect means the HTML Next sends contains no child at all — so "absent from the document until a
//      choice exists" is true of the first byte, not merely of the hydrated page. An initialiser that read the
//      cookie during render would be both wrong (no `document` on the server) and a hydration mismatch.
//   2. **"No answer" is not consent.** A missing cookie, a malformed one and a lapsed one all parse to `null`
//      (`consent-preference.ts`), and `null` renders nothing.
//   3. **A later choice moves it both ways.** `onConsentChanged` re-reads, so accepting mounts without a
//      reload and withdrawing unmounts — Art 7(3) says withdrawal must be as easy as consent, and a tracker
//      that stays until the next navigation is not withdrawal.
//
// It is the **only** place a consent-gated script may be mounted, and `consent-gate.repo.test.ts` is what makes
// that true rather than a comment: the tracker imports are allow-listed to the files this gate wraps.
import { useEffect, useState } from "react";
import { onConsentChanged } from "@/lib/legal/consent-changed-event";
import { readConsentPreference } from "@/lib/legal/read-consent-preference";

export type ConsentCategory = "analytics" | "marketing";

export function ConsentGate({
  category,
  children,
}: {
  readonly category: ConsentCategory;
  readonly children: React.ReactNode;
}) {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    const read = () => {
      const preference = readConsentPreference();
      setGranted(
        preference !== null &&
          (category === "analytics"
            ? preference.analyticsEnabled
            : preference.marketingEnabled),
      );
    };
    read();
    return onConsentChanged(read);
  }, [category]);

  return granted ? <>{children}</> : null;
}
