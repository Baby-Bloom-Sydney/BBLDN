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
// to reference.
//
// **ADR-136 — and the third column.** `1e` and `1g` both pinned "no K-row message reaches a nanny", because
// 07 §5.2 keeps her address out of `nanny_public` and no document authorised a service-scope read of her
// contact details. The ruling moved that read into `comms`, so what this adapter answers is her **`user_id`** —
// an identifier, not contact data, and the same one `connection_requests` and `auth.users` already key on.
// `NannyFacts` still carries **no name and no address**; `comms` resolves the address inside the send and never
// hands it back. The gap is closed by making this module able to do less, not more.
import type { DataAccessPort } from "@/modules/auth";
import type { NannyFacts } from "@/modules/connections";
import type { NannyId, Result, Uuid } from "@/modules/shared-types";

type NannyRow = {
  readonly user_id: string;
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
          userId: row.user_id as Uuid,
        });
      },
    },
    { scope: "service" },
  );
}
