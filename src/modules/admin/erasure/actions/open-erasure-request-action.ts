"use server";
// S-A-xx step 1 — **record** an Art 17 request that arrived by email (07 §6.1). It erases nothing, and that is
// the whole reason it is its own action: an admin transcribing an address from an email can mistype it, and a
// mistyped address must produce a wrong *request row* that a person can see and delete, never a wrong erasure.
//
// The address is caller input and is treated as such — validated at the boundary, then handed to the connector,
// which resolves it to a subject **server-side** through `user_profiles`. The id never travels in a form.
import { z } from "zod";
import { privacy, err, toActionResult } from "@/modules/platform";
import type { ErasureActionDetails, OpenErasureRequestAction } from "../types";
import { consumeAdminRouteLimit } from "../lib/consume-admin-route-limit";
import { requireAdmin } from "../lib/require-admin";

const schema = z.object({ email: z.string().email() });

export const openErasureRequestAction: OpenErasureRequestAction = async (
  _previous,
  formData,
) => {
  const admin = await requireAdmin();
  if (!admin.ok) return toActionResult(admin);
  // Role first, budget second, work third — the order the other admin roads take (REVIEW-3 security M-4), so a
  // call that will be refused does not first buy an unmetered service-scope read.
  const limited = await consumeAdminRouteLimit(admin.value);
  if (!limited.ok) return toActionResult(limited);

  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success)
    return toActionResult(
      err<ErasureActionDetails>(
        "VALIDATION",
        "Enter the email address on the request.",
        {
          reason: "invalid-input",
        },
      ),
    );

  const opened = await privacy.openRequestForEmail({
    email: parsed.data.email,
    requestedBy: admin.value,
  });
  if (!opened.ok)
    return toActionResult(
      err<ErasureActionDetails>(
        opened.error.details?.reason === "subject-not-found"
          ? "NOT_FOUND"
          : "INTERNAL",
        opened.error.details?.reason === "subject-not-found"
          ? "No account matches that address."
          : "That could not be recorded just now.",
        {
          reason:
            opened.error.details?.reason === "subject-not-found"
              ? "subject-not-found"
              : "store-failed",
        },
      ),
    );
  return toActionResult(opened);
};
