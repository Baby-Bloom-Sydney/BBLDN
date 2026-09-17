// The two nanny facts K-1 / K-2 / K-3 check before a family is put in front of her: **verification level**
// (`config.matching.minVerificationLevel`) and **isolation** (I-5, ADR-017 / ADR-058).
//
// **Read from `nannies` at service scope, deliberately, and only these two columns.** `nanny_public` is "a
// parent's only road to a nanny" (07 §5.2, ADR-129) and it already excludes isolated nannies — which is exactly
// why it cannot answer this: a nanny missing from the view is indistinguishable from a nanny who does not
// exist, and 03 §2.5 names `ISOLATED_NANNY` as a **distinct** `E_PRECONDITION_FAILED { which }`. A stage model
// that cannot tell "she is not available to you" from "there is no such person" refuses both the same way, and
// an admin reading the log cannot tell either.
//
// This is not a widening of what a parent may see: nothing here reaches a route, a screen or a parent-facing
// message. It is the module that owns `connection_requests` asking two matching flags about a row it is about
// to reference. **No name and no address**: `NannyFacts.email` is left `undefined`, so no K-row message reaches
// a nanny — the same gap `1e` pinned on autofire's `precheck-nanny` blast, for the same reason. No document
// authorises a service-scope read of a nanny's contact details, and inventing one would put an unsanctioned use
// of personal data in the codebase. It wants a recipient port, ruled and wired; it is pinned, not papered over.
import type { DataAccessPort } from "@/modules/auth";
import type { NannyFacts } from "@/modules/connections";
import type { NannyId, Result } from "@/modules/shared-types";

type NannyRow = {
  readonly verification_level: string | null;
  readonly is_isolated: boolean | null;
};

export function dbNannyFacts(
  port: DataAccessPort,
  nannyId: NannyId,
): Promise<Result<NannyFacts | null>> {
  return port.run(
    {
      name: "connections.readNannyFacts",
      exec: async (q) => {
        const row = (await q
          .from("nannies")
          .eq("id", nannyId)
          .single()) as NannyRow | null;
        if (row === null) return null;
        return Object.freeze({
          verificationLevel: row.verification_level ?? "L0_SIGNED_UP",
          isolated: row.is_isolated ?? false,
        });
      },
    },
    { scope: "service" },
  );
}
