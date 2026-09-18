"use server";
// The level-4 action (04 §4.1 row 15; ADR-157 (3)): what the Update Service said about the certificate, recorded
// by the session's admin. The nanny is named by user id from the open row; the result is 02 §3's enum.
import { z } from "zod";
import { err, toActionResult } from "@/modules/platform";
import { ENUMS } from "@/modules/shared-types";
import { verification } from "@/modules/verification";
import type { ActionDetails, RecordUpdateServiceAction } from "../types";
import { refuseAdminAction } from "../lib/refuse-admin-action";

const schema = z.object({
  nannyId: z.string().uuid(),
  result: z.enum(ENUMS.update_service_result),
  subscribed: z.enum(["true", "false"]),
});

export const recordUpdateServiceAction: RecordUpdateServiceAction = async (
  _previous,
  formData,
) => {
  const parsed = schema.safeParse({
    nannyId: formData.get("nannyId"),
    result: formData.get("result"),
    subscribed: formData.get("subscribed") ?? "false",
  });
  if (!parsed.success)
    return toActionResult(
      err<ActionDetails>("VALIDATION", "Check the result and try again.", {
        reason: "invalid-input",
        field: String(parsed.error.issues[0]?.path[0] ?? "result"),
      }),
    );
  return refuseAdminAction(
    "recordUpdateService",
    await verification.recordUpdateServiceCheck({
      nannyId: parsed.data.nannyId as never,
      result: parsed.data.result,
      subscribed: parsed.data.subscribed === "true",
    }),
  );
};
