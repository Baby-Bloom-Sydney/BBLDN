"use server";
// S-A-xx step 2 — run the erasure for a request already on the ledger (07 §6.1; B-46).
//
// ★ **The only thing this action accepts is a request id.** The subject is read off that row inside
// `privacy.runRequest`, which is ADR-145's pattern and 07 §5.4 row 6's rule: an admin names a *request*, never a
// person. There is deliberately no `userId` parameter to forge, and adding one would be the defect, not a
// convenience.
import { privacy, err, toActionResult } from "@/modules/platform";
import type { ErasureActionDetails, RunErasureRequestAction } from "../types";
import { consumeAdminRouteLimit } from "../lib/consume-admin-route-limit";
import { requireAdmin } from "../lib/require-admin";

const REASONS: Readonly<Record<string, ErasureActionDetails["reason"]>> =
  Object.freeze({
    "request-not-found": "request-not-found",
    "request-not-open": "request-not-open",
  });

export const runErasureRequestAction: RunErasureRequestAction = async (
  input,
) => {
  const admin = await requireAdmin();
  if (!admin.ok) return toActionResult(admin);
  const limited = await consumeAdminRouteLimit(admin.value);
  if (!limited.ok) return toActionResult(limited);

  if (typeof input?.requestId !== "string" || input.requestId === "")
    return toActionResult(
      err<ErasureActionDetails>("VALIDATION", "Choose a request.", {
        reason: "invalid-input",
      }),
    );

  const run = await privacy.runRequest(input.requestId);
  if (!run.ok) {
    const reason = REASONS[run.error.details?.reason ?? ""] ?? "store-failed";
    return toActionResult(
      err<ErasureActionDetails>(
        reason === "store-failed" ? "INTERNAL" : "CONFLICT",
        reason === "request-not-found"
          ? "That request no longer exists."
          : reason === "request-not-open"
            ? "That request has already been answered."
            : "That could not be completed just now.",
        { reason },
      ),
    );
  }
  return toActionResult(run);
};
