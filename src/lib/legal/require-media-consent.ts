// The one line a server action writes to gate a child-tied media URL on the parent's consent (FATE `07.71`).
//
// **Contract, unchanged:** if there is no `imageUrl`, the gate does not fire — the action's non-media part still
// works, because a text-only diary entry is not a media write and consent for photographs is not consent for
// text.
//
// **What changed (L-009 `3g`): the `NODE_ENV === "test"` bypass is gone.** It returned `{ ok: true }` for every
// caller in every test run, which meant no test in the tree — not one — could have caught this gate being
// wrong. It was justified by pointing at the gate's own dedicated suite, and that is exactly the argument that
// does not hold: the gate's suite proves the *decision*, and this file is about the *wiring*, which is the half
// that silently stops being connected. A gate that is off under test has a coverage number and no coverage.
//
// Callers that do not care about consent now mock this module (`observations.test.ts` already did), which is
// what a test should have been doing all along: stating that it is not exercising the gate, rather than a
// production file stating it for them.
import { createAdminClient } from "@/lib/supabase/admin";
import { hasParentMediaConsent } from "./media-consent-gate";

/** `null`-ish `imageUrl` ⇒ no gate. Otherwise the parent's bundled per-child consent decides. */
export async function requireMediaConsentForImageWrite(input: {
  childId: string;
  imageUrl: string | null | undefined;
}): Promise<{ ok: true } | { ok: false; error: "media_consent_required" }> {
  if (!input.imageUrl) return { ok: true };

  const gate = await hasParentMediaConsent(
    { childId: input.childId },
    { admin: createAdminClient() },
  );
  if (gate.allowed) return { ok: true };
  return { ok: false, error: "media_consent_required" };
}
